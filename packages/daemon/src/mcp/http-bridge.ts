/**
 * In-process MCP HTTP bridge for Codex SDK (Streamable HTTP transport).
 *
 * Starts a local-only HTTP server in the daemon process and exposes
 * Cozybase MCP tools via a single endpoint:
 *   ALL <basePath>
 *
 * The bridge is protected with a Bearer token.
 */

import { randomUUID, timingSafeEqual } from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { URL } from 'url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server';
import type { HandlerContext } from './handlers';

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

export interface InProcessMcpHttpBridge {
  /** Streamable HTTP URL passed to Codex mcp_servers.cozybase.url */
  url: string;
  /** Bearer token passed to Codex mcp_servers.cozybase.http_headers.Authorization */
  bearerToken: string;
  close(): Promise<void>;
}

export interface StartInProcessMcpHttpBridgeOptions {
  host?: string;
  port?: number;
  basePath?: string;
}

export interface StartInProcessMcpHttpBridgeWithFactoryOptions
  extends StartInProcessMcpHttpBridgeOptions {
  createServer: () => McpServer;
}

export async function startInProcessMcpHttpBridge(
  ctx: HandlerContext,
  options: StartInProcessMcpHttpBridgeOptions = {},
): Promise<InProcessMcpHttpBridge> {
  return startInProcessMcpHttpBridgeWithFactory({
    ...options,
    createServer: () => createMcpServer(ctx),
  });
}

export async function startInProcessMcpHttpBridgeWithFactory(
  options: StartInProcessMcpHttpBridgeWithFactoryOptions,
): Promise<InProcessMcpHttpBridge> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const mcpPath = normalizeBasePath(options.basePath ?? '/internal/mcp');
  const bearerToken = randomUUID();

  const sessions = new Map<string, SessionEntry>();

  const closeSession = async (sessionId: string) => {
    const entry = sessions.get(sessionId);
    if (!entry) return;

    sessions.delete(sessionId);
    await entry.transport.close().catch(() => {});
    await entry.server.close().catch(() => {});
  };

  const createSession = async (): Promise<SessionEntry> => {
    let entry: SessionEntry;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        if (entry) {
          sessions.set(sessionId, entry);
        }
      },
      onsessionclosed: (sessionId) => {
        const existing = sessions.get(sessionId);
        if (!existing) return;
        sessions.delete(sessionId);
        void existing.server.close().catch(() => {});
      },
    });

    const mcpServer = options.createServer();
    entry = { transport, server: mcpServer };
    await mcpServer.connect(transport);
    return entry;
  };

  const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    if (!isAuthorized(req, bearerToken)) {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }

    const parsed = parseRequestUrl(req);
    if (!parsed) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    if (parsed.pathname !== mcpPath) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const sessionId = getSessionId(req);
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.statusCode = 404;
        res.end('Unknown sessionId');
        return;
      }

      await session.transport.handleRequest(req, res);
      return;
    }

    // Requests without Mcp-Session-Id can only be initialization POSTs.
    if (req.method !== 'POST') {
      res.statusCode = 400;
      res.end('Missing mcp-session-id header');
      return;
    }

    const session = await createSession();
    try {
      await session.transport.handleRequest(req, res);
    } catch (err) {
      await session.transport.close().catch(() => {});
      await session.server.close().catch(() => {});
      throw err;
    }

    const createdSessionId = session.transport.sessionId;
    if (createdSessionId) {
      // Safety net in case onsessioninitialized isn't invoked for some reason.
      if (!sessions.has(createdSessionId)) {
        sessions.set(createdSessionId, session);
      }
      return;
    }

    // Initialization failed; ensure resources are reclaimed.
    await session.transport.close().catch(() => {});
    await session.server.close().catch(() => {});
  };

  const server = await listenWithRetry(() => createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      console.error('[mcp-http-bridge] request failed:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      if (!res.writableEnded) {
        res.end('Internal Server Error');
      }
    });
  }), host, port);

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve MCP HTTP bridge address');
  }

  const url = `http://${host}:${address.port}${mcpPath}`;

  return {
    url,
    bearerToken,
    async close() {
      for (const sessionId of Array.from(sessions.keys())) {
        await closeSession(sessionId);
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

function normalizeBasePath(pathname: string): string {
  const value = pathname.trim() || '/internal/mcp';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

function parseRequestUrl(req: IncomingMessage): URL | null {
  if (!req.url) return null;
  return new URL(req.url, 'http://localhost');
}

function getSessionId(req: IncomingMessage): string | null {
  const value = req.headers['mcp-session-id'];
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' && value[0].length > 0 ? value[0] : null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string') {
    return false;
  }
  const expected = `Bearer ${token}`;
  const actualBuf = Buffer.from(auth);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(actualBuf, expectedBuf);
}

async function listenWithRetry(
  createHttpServer: () => ReturnType<typeof createServer>,
  host: string,
  port: number,
): Promise<ReturnType<typeof createServer>> {
  if (port > 0) {
    const server = createHttpServer();
    await listenOnce(server, host, port);
    return server;
  }

  try {
    const server = createHttpServer();
    await listenOnce(server, host, 0);
    return server;
  } catch {
    // Bun's node:http adapter may fail with port=0 in some environments.
    // Retry with random high ports when auto-assignment is unavailable.
  }

  let lastError: unknown = null;
  for (let i = 0; i < 12; i++) {
    const candidate = 38000 + Math.floor(Math.random() * 20000);
    try {
      const server = createHttpServer();
      await listenOnce(server, host, candidate);
      return server;
    } catch (err: any) {
      lastError = err;
      if (err?.code !== 'EADDRINUSE') {
        throw err;
      }
    }
  }

  throw lastError ?? new Error('Failed to bind MCP HTTP bridge to an available local port');
}

function listenOnce(
  server: ReturnType<typeof createServer>,
  host: string,
  port: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (err: unknown) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    try {
      server.listen(port, host);
    } catch (err) {
      server.off('error', onError);
      server.off('listening', onListening);
      reject(err);
    }
  });
}
