import {
  PROTOCOL_VERSION,
  RequestError,
  type Agent,
  type AgentSideConnection,
  type CancelNotification,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type SessionNotification,
  type SessionUpdate,
} from '@agentclientprotocol/sdk';
import { CozyBaseAcpEventMapper } from './event-mapper';
import type {
  AcpServerOptions,
  CozyBaseBridgeSocket,
  CozyBaseWireEvent,
  SocketCloseEventLike,
  SocketErrorEventLike,
  SocketMessageEventLike,
  SocketOpenEventLike,
} from './types';

interface ActivePrompt {
  requestMessageId: string | null;
  cancelled: boolean;
  resolve: (value: PromptResponse) => void;
  reject: (error: unknown) => void;
}

interface SessionState {
  sessionId: string;
  cwd: string;
  socket: CozyBaseBridgeSocket;
  connected: boolean;
  mapper: CozyBaseAcpEventMapper;
  activeLifecycleId: string | null;
  lifecyclePendingStart: boolean;
  waiters: ActivePrompt[];
  updateQueue: Promise<void>;
}

export class CozyBaseAcpServer implements Agent {
  private readonly sessions = new Map<string, SessionState>();
  private readonly daemonUrl: string;
  private readonly socketFactory: (url: string) => CozyBaseBridgeSocket;
  private readonly version: string;

  constructor(
    private readonly connection: AgentSideConnection,
    options: AcpServerOptions,
  ) {
    this.daemonUrl = normalizeDaemonUrl(options.daemonUrl);
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as CozyBaseBridgeSocket);
    this.version = options.version ?? (process.env.COZYBASE_VERSION?.trim() || '0.1.0');
  }

  bindConnectionLifecycle(): void {
    this.connection.signal.addEventListener('abort', () => {
      void this.shutdown();
    }, { once: true });
  }

  async initialize(_params: InitializeRequest): Promise<InitializeResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentInfo: {
        name: 'cozybase',
        title: 'CozyBase ACP Agent',
        version: this.version,
      },
      agentCapabilities: {
        loadSession: false,
      },
    };
  }

  async authenticate(): Promise<{}> {
    return {};
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId = crypto.randomUUID();
    const socket = this.socketFactory(buildCozyBaseWebSocketUrl(this.daemonUrl));
    const session: SessionState = {
      sessionId,
      cwd: params.cwd,
      socket,
      connected: false,
      mapper: new CozyBaseAcpEventMapper(),
      activeLifecycleId: null,
      lifecyclePendingStart: false,
      waiters: [],
      updateQueue: Promise.resolve(),
    };
    this.sessions.set(sessionId, session);
    this.bindSocket(session);

    try {
      await waitForSocketOpen(socket, this.connection.signal);
      session.connected = socket.readyState === 1;
    } catch (error) {
      this.sessions.delete(sessionId);
      throw RequestError.internalError(
        { sessionId },
        `Failed to connect to CozyBase daemon: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { sessionId };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.requireSession(params.sessionId);
    if (!session.connected || session.socket.readyState !== 1) {
      throw RequestError.internalError(
        { sessionId: params.sessionId },
        'CozyBase bridge websocket is not connected',
      );
    }
    const promptText = extractPromptText(params);
    if (!promptText.trim()) {
      throw RequestError.invalidParams(
        { sessionId: params.sessionId },
        'Prompt must include at least one text content block',
      );
    }

    return await new Promise<PromptResponse>((resolve, reject) => {
      session.waiters.push({
        requestMessageId: params.messageId ?? null,
        cancelled: false,
        resolve,
        reject,
      });
      if (!session.activeLifecycleId) {
        session.lifecyclePendingStart = true;
      }

      try {
        session.socket.send(JSON.stringify({
          type: 'chat:send',
          message: promptText,
        }));
      } catch (error) {
        session.waiters = session.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(RequestError.internalError(
          { sessionId: params.sessionId },
          error instanceof Error ? error.message : String(error),
        ));
      }
    });
  }

  async cancel(params: CancelNotification): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session || session.waiters.length === 0 || session.socket.readyState !== 1) {
      return;
    }
    for (const waiter of session.waiters) {
      waiter.cancelled = true;
    }
    session.socket.send(JSON.stringify({ type: 'chat:cancel' }));
  }

  async loadSession(): Promise<never> {
    throw RequestError.methodNotFound('session/load');
  }

  async setSessionMode(): Promise<never> {
    throw RequestError.methodNotFound('session/set_mode');
  }

  async setSessionConfigOption(): Promise<never> {
    throw RequestError.methodNotFound('session/set_config_option');
  }

  async unstable_setSessionModel(): Promise<never> {
    throw RequestError.methodNotFound('session/set_model');
  }

  async unstable_listSessions(): Promise<never> {
    throw RequestError.methodNotFound('session/list');
  }

  async unstable_forkSession(): Promise<never> {
    throw RequestError.methodNotFound('session/fork');
  }

  async unstable_resumeSession(): Promise<never> {
    throw RequestError.methodNotFound('session/resume');
  }

  async extMethod(method: string): Promise<never> {
    throw RequestError.methodNotFound(method);
  }

  async extNotification(method: string): Promise<never> {
    throw RequestError.methodNotFound(method);
  }

  async shutdown(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.socket.readyState === 0 || session.socket.readyState === 1) {
        session.socket.close();
      }
    }
    this.sessions.clear();
  }

  private bindSocket(session: SessionState): void {
    session.connected = session.socket.readyState === 1;

    session.socket.addEventListener('open', (_event: SocketOpenEventLike) => {
      session.connected = true;
    });

    session.socket.addEventListener('message', (event: SocketMessageEventLike) => {
      void this.handleSocketMessage(session, event);
    });

    session.socket.addEventListener('close', (event: SocketCloseEventLike) => {
      session.connected = false;
      this.rejectAllWaiters(
        session,
        RequestError.internalError(
          { sessionId: session.sessionId, code: event.code, reason: event.reason },
          'CozyBase bridge websocket closed',
        ),
      );
    });

    session.socket.addEventListener('error', (event: SocketErrorEventLike) => {
      if (session.waiters.length === 0) {
        return;
      }
      this.rejectAllWaiters(
        session,
        RequestError.internalError(
          { sessionId: session.sessionId, error: event.error },
          event.message ?? 'CozyBase bridge websocket error',
        ),
      );
    });
  }

  private async handleSocketMessage(session: SessionState, event: SocketMessageEventLike): Promise<void> {
    const raw = decodeSocketData(event.data);
    let payload: CozyBaseWireEvent;

    try {
      payload = JSON.parse(raw) as CozyBaseWireEvent;
    } catch {
      return;
    }

    if (payload.type === 'session.connected') {
      session.connected = true;
      return;
    }

    if (payload.type === 'session.history') {
      return;
    }

    if (payload.type === 'session.error') {
      this.rejectAllWaiters(
        session,
        RequestError.internalError(
          { sessionId: session.sessionId },
          String((payload as { message?: unknown }).message ?? 'Session error'),
        ),
      );
      return;
    }

    if (payload.type === 'lifecycle.started') {
      session.activeLifecycleId = String((payload as { lifecycleId?: unknown }).lifecycleId ?? '');
      session.lifecyclePendingStart = false;
      return;
    }

    if (payload.type === 'lifecycle.completed') {
      const lifecycleId = String((payload as { lifecycleId?: unknown }).lifecycleId ?? '');
      if (session.activeLifecycleId && lifecycleId !== session.activeLifecycleId) {
        return;
      }
      this.resolveAllWaiters(session);
      session.activeLifecycleId = null;
      session.lifecyclePendingStart = false;
      return;
    }

    if (payload.type === 'lifecycle.failed') {
      const lifecycleId = String((payload as { lifecycleId?: unknown }).lifecycleId ?? '');
      if (session.activeLifecycleId && lifecycleId !== session.activeLifecycleId) {
        return;
      }
      this.rejectAllWaiters(
        session,
        RequestError.internalError(
          { sessionId: session.sessionId, lifecycleId },
          String(payload.message ?? 'Lifecycle failed'),
        ),
      );
      session.activeLifecycleId = null;
      session.lifecyclePendingStart = false;
      return;
    }

    if (payload.type === 'conversation.error') {
      if (!session.activeLifecycleId && !session.lifecyclePendingStart) {
        this.rejectAllWaiters(
          session,
          RequestError.internalError(
            { sessionId: session.sessionId },
            String(payload.message ?? 'Conversation error'),
          ),
        );
      }
      return;
    }

    if (!String(payload.type).startsWith('conversation.')) {
      return;
    }

    const updates = session.mapper.map(payload as any);
    for (const update of updates) {
      this.enqueueSessionUpdate(session, update);
    }
  }

  private enqueueSessionUpdate(session: SessionState, update: SessionUpdate): void {
    const notification: SessionNotification = {
      sessionId: session.sessionId,
      update,
    };

    session.updateQueue = session.updateQueue
      .then(() => this.connection.sessionUpdate(notification))
      .catch(() => {});
  }

  private requireSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw RequestError.invalidParams({ sessionId }, `Unknown session '${sessionId}'`);
    }
    return session;
  }

  private resolveAllWaiters(session: SessionState): void {
    const pending = [...session.waiters];
    session.waiters = [];
    for (const waiter of pending) {
      waiter.resolve({
        stopReason: waiter.cancelled ? 'cancelled' : 'end_turn',
        userMessageId: waiter.requestMessageId,
      });
    }
  }

  private rejectAllWaiters(session: SessionState, error: unknown): void {
    const pending = [...session.waiters];
    session.waiters = [];
    for (const waiter of pending) {
      waiter.reject(error);
    }
  }
}

export function normalizeDaemonUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function buildCozyBaseWebSocketUrl(daemonUrl: string): string {
  const normalized = normalizeDaemonUrl(daemonUrl);
  if (normalized.startsWith('https://')) {
    return `wss://${normalized.slice('https://'.length)}/api/v1/cozybase/ws`;
  }
  if (normalized.startsWith('http://')) {
    return `ws://${normalized.slice('http://'.length)}/api/v1/cozybase/ws`;
  }
  if (normalized.startsWith('wss://') || normalized.startsWith('ws://')) {
    return `${normalized}/api/v1/cozybase/ws`;
  }
  return `ws://${normalized}/api/v1/cozybase/ws`;
}

export async function waitForSocketOpen(
  socket: CozyBaseBridgeSocket,
  signal?: AbortSignal,
): Promise<void> {
  if (socket.readyState === 1) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new Error('Connection aborted'));
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before opening'));
    };
    const onError = () => {
      cleanup();
      reject(new Error('WebSocket failed to open'));
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    socket.addEventListener('open', onOpen);
    socket.addEventListener('close', onClose);
    socket.addEventListener('error', onError);
  });
}

function extractPromptText(params: PromptRequest): string {
  const parts: string[] = [];

  for (const block of params.prompt) {
    if (block.type === 'text') {
      parts.push(block.text);
      continue;
    }

    if (block.type === 'resource_link') {
      parts.push(block.uri);
    }
  }

  return parts.join('\n\n').trim();
}

function decodeSocketData(data: SocketMessageEventLike['data']): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf-8');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf-8');
  }
  if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
    return Buffer.from(data).toString('utf-8');
  }
  throw new Error('Unsupported websocket payload type');
}
