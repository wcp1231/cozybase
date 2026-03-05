import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const capturedConfigs: any[] = [];

mock.module('@cozybase/agent', () => {
  class StubAgentQuery {
    async interrupt() {}
    close() {}
    async *[Symbol.asyncIterator]() {
      yield { type: 'conversation.run.started' };
      yield { type: 'conversation.run.completed', sessionId: 'thread-1' };
    }
  }

  class StubCodexProvider {
    createQuery(config: unknown) {
      capturedConfigs.push(config);
      return new StubAgentQuery();
    }
    async isAvailable() { return true; }
    dispose() {}
  }

  class StubClaudeProvider extends StubCodexProvider {}

  return {
    CodexProvider: StubCodexProvider,
    ClaudeCodeProvider: StubClaudeProvider,
  };
});

mock.module('../../src/mcp/http-bridge.ts', () => ({
  async startInProcessMcpHttpBridge() {
    return {
      url: 'http://127.0.0.1:43210/internal/mcp',
      bearerToken: 'test-token',
      async close() {},
    };
  },
}));

const { createServer } = await import('../../src/server.ts');

describe('Codex MCP HTTP config', () => {
  let previousEnv: Record<string, string | undefined> = {};
  let root: string;

  beforeEach(() => {
    capturedConfigs.length = 0;
    root = mkdtempSync(join(tmpdir(), 'cozybase-codex-http-'));
    previousEnv = {
      COZYBASE_AGENT_PROVIDER: process.env.COZYBASE_AGENT_PROVIDER,
      COZYBASE_CODEX_MCP_MODE: process.env.COZYBASE_CODEX_MCP_MODE,
    };
    process.env.COZYBASE_AGENT_PROVIDER = 'codex';
    process.env.COZYBASE_CODEX_MCP_MODE = 'http';
  });

  afterEach(() => {
    process.env.COZYBASE_AGENT_PROVIDER = previousEnv.COZYBASE_AGENT_PROVIDER;
    process.env.COZYBASE_CODEX_MCP_MODE = previousEnv.COZYBASE_CODEX_MCP_MODE;
    rmSync(root, { recursive: true, force: true });
  });

  test('uses http_headers Authorization instead of bearer_token', async () => {
    const { chatSessionManager, startup, shutdownAgentInfra, workspace } = createServer({
      workspaceDir: root,
      port: 3000,
      host: '127.0.0.1',
      jwtSecret: 'test-secret',
    });

    await startup;

    const session = chatSessionManager.getOrCreate('welcome');
    await session.injectPrompt('hello');

    const config = capturedConfigs.at(-1);
    const mcpConfig = config?.providerOptions?.codexConfig?.mcp_servers?.cozybase;

    expect(mcpConfig?.type).toBe('streamable_http');
    expect(mcpConfig?.url).toBe('http://127.0.0.1:43210/internal/mcp');
    expect(mcpConfig?.http_headers?.Authorization).toBe('Bearer test-token');
    expect('bearer_token' in mcpConfig).toBeFalse();

    await shutdownAgentInfra();
    workspace.close();
  });
});
