import type {
  AgentEvent,
  LifecycleEvent,
  SessionEvent,
} from '@cozybase/ai-runtime';
import type { AgentSideConnection } from '@agentclientprotocol/sdk';

export type CozyBaseWireEvent = AgentEvent | LifecycleEvent | SessionEvent | { type: string; [key: string]: unknown };

export interface SocketOpenEventLike {
  type: 'open';
}

export interface SocketMessageEventLike {
  type: 'message';
  data: string | Buffer | ArrayBufferLike | ArrayBufferView;
}

export interface SocketCloseEventLike {
  type: 'close';
  code?: number;
  reason?: string;
}

export interface SocketErrorEventLike {
  type: 'error';
  error?: unknown;
  message?: string;
}

export interface CozyBaseBridgeSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: (event: SocketOpenEventLike) => void): void;
  addEventListener(type: 'message', listener: (event: SocketMessageEventLike) => void): void;
  addEventListener(type: 'close', listener: (event: SocketCloseEventLike) => void): void;
  addEventListener(type: 'error', listener: (event: SocketErrorEventLike) => void): void;
}

export type CozyBaseSocketFactory = (url: string) => CozyBaseBridgeSocket;

export interface AcpServerOptions {
  daemonUrl: string;
  workspaceDir: string;
  socketFactory?: CozyBaseSocketFactory;
  connection?: AgentSideConnection;
  version?: string;
}
