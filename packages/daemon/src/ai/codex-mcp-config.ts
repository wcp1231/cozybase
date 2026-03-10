import { join } from 'path';
import { resolveBunExecutable, resolveDaemonEntryPath } from '../runtime-paths';

function buildCodexStdioMcpServerConfig(commandName: string, args: string[]) {
  return {
    type: 'stdio' as const,
    command: resolveBunExecutable(),
    args: [
      resolveDaemonEntryPath(),
      commandName,
      ...args,
    ],
  };
}

export function buildBuilderCodexMcpServerConfig(params: {
  workspaceDir: string;
  agentDir: string;
}) {
  return buildCodexStdioMcpServerConfig('builder-mcp', [
    '--workspace',
    params.workspaceDir,
    '--apps-dir',
    join(params.agentDir, 'apps'),
  ]);
}

export function buildOperatorCodexMcpServerConfig(params: {
  workspaceDir: string;
  appSlug: string;
}) {
  return buildCodexStdioMcpServerConfig('operator-mcp', [
    '--workspace',
    params.workspaceDir,
    '--app',
    params.appSlug,
  ]);
}

export function buildCozyBaseCodexMcpServerConfig(params: {
  workspaceDir: string;
}) {
  return buildCodexStdioMcpServerConfig('cozybase-mcp', [
    '--workspace',
    params.workspaceDir,
  ]);
}
