import { accessSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { delimiter, join } from 'path';
import { resolveOpenClawTemplatesDir } from '../../runtime-paths';

export interface OpenClawStatus {
  openClawDirPath: string;
  skillsDirPath: string;
  skillFilePath: string;
  acpxConfigPath: string;
  openClawDirExists: boolean;
  skillsDirExists: boolean;
  skillFileExists: boolean;
  acpxExecutableExists: boolean;
  acpxExecutablePath: string | null;
  acpxConfigExists: boolean;
  acpxConfigValid: boolean;
  acpxConfigIssue: string | null;
}

interface AcpxConfigFile {
  agents?: Record<string, unknown>;
  defaultAgent?: string;
}

interface CommandRunResult {
  success: boolean;
  exitCode: number;
  stderr: string;
}

interface ConfigureAcpxOptions {
  runAcpxInit?: () => CommandRunResult;
}

export const COZYBASE_ACPX_COMMAND = '~/.cozybase/bin/cozybase acp';
const OPENCLAW_SKILLS_TEMPLATE_DIR = join(resolveOpenClawTemplatesDir(), 'skills', 'cozybase');

function getUserHomeDir(): string {
  const envHome = process.env.HOME?.trim();
  return envHome ? envHome : homedir();
}

function resolveHomePath(...segments: string[]): string {
  return join(getUserHomeDir(), ...segments);
}

function isDirectory(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function readAcpxConfigStatus(path: string): Pick<OpenClawStatus, 'acpxConfigExists' | 'acpxConfigValid' | 'acpxConfigIssue'> {
  if (!existsSync(path)) {
    return {
      acpxConfigExists: false,
      acpxConfigValid: false,
      acpxConfigIssue: '未检测到 ~/.acpx/config.json。',
    };
  }

  const parsed = readJsonFile<AcpxConfigFile>(path);
  if (!parsed) {
    return {
      acpxConfigExists: true,
      acpxConfigValid: false,
      acpxConfigIssue: 'config.json 解析失败。',
    };
  }

  const cozybaseEntry = parsed.agents?.cozybase;
  const command = cozybaseEntry && typeof cozybaseEntry === 'object'
    ? (cozybaseEntry as Record<string, unknown>).command
    : undefined;

  if (command !== COZYBASE_ACPX_COMMAND) {
    return {
      acpxConfigExists: true,
      acpxConfigValid: false,
      acpxConfigIssue: `未检测到 .agents.cozybase.command = "${COZYBASE_ACPX_COMMAND}"。`,
    };
  }

  return {
    acpxConfigExists: true,
    acpxConfigValid: true,
    acpxConfigIssue: null,
  };
}

function findExecutableOnPath(name: string): string | null {
  const pathValue = process.env.PATH ?? '';
  for (const entry of pathValue.split(delimiter)) {
    const dir = entry.trim();
    if (!dir) continue;

    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function runDefaultAcpxInit(): CommandRunResult {
  const proc = Bun.spawnSync(['acpx', 'config', 'init'], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });

  return {
    success: proc.success,
    exitCode: proc.exitCode,
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr).trim() : '',
  };
}

function copyTemplateDir(srcDir: string, destDir: string): void {
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    throw new Error(`OpenClaw skills 模板目录不存在：${srcDir}`);
  }

  mkdirSync(destDir, { recursive: true });

  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyTemplateDir(srcPath, destPath);
      continue;
    }

    if (entry.isFile()) {
      mkdirSync(destDir, { recursive: true });
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

export function readOpenClawStatus(): OpenClawStatus {
  const openClawDirPath = resolveHomePath('.openclaw');
  const skillsDirPath = resolveHomePath('.openclaw', 'skills', 'cozybase');
  const skillFilePath = join(skillsDirPath, 'SKILL.md');
  const acpxConfigPath = resolveHomePath('.acpx', 'config.json');
  const acpxExecutablePath = findExecutableOnPath('acpx');
  const configStatus = readAcpxConfigStatus(acpxConfigPath);

  return {
    openClawDirPath,
    skillsDirPath,
    skillFilePath,
    acpxConfigPath,
    openClawDirExists: isDirectory(openClawDirPath),
    skillsDirExists: isDirectory(skillsDirPath),
    skillFileExists: existsSync(skillFilePath) && statSync(skillFilePath).isFile(),
    acpxExecutableExists: acpxExecutablePath !== null,
    acpxExecutablePath,
    acpxConfigExists: configStatus.acpxConfigExists,
    acpxConfigValid: configStatus.acpxConfigValid,
    acpxConfigIssue: configStatus.acpxConfigIssue,
  };
}

export function configureAcpxForCozybase(options: ConfigureAcpxOptions = {}): OpenClawStatus {
  const configDirPath = resolveHomePath('.acpx');
  const configPath = join(configDirPath, 'config.json');
  const runAcpxInit = options.runAcpxInit ?? runDefaultAcpxInit;

  mkdirSync(configDirPath, { recursive: true });

  if (!existsSync(configPath)) {
    const result = runAcpxInit();
    if (!result.success) {
      const detail = result.stderr ? `：${result.stderr}` : '';
      throw new Error(`执行 \`acpx config init\` 失败${detail}`);
    }
    if (!existsSync(configPath)) {
      throw new Error('执行 `acpx config init` 后仍未生成 ~/.acpx/config.json。');
    }
  }

  const existing = readJsonFile<AcpxConfigFile>(configPath) ?? {};
  const agents = existing.agents && typeof existing.agents === 'object' ? { ...existing.agents } : {};
  const previousCozybase = agents.cozybase && typeof agents.cozybase === 'object'
    ? { ...(agents.cozybase as Record<string, unknown>) }
    : {};

  agents.cozybase = {
    ...previousCozybase,
    command: COZYBASE_ACPX_COMMAND,
  };

  const nextConfig: AcpxConfigFile = {
    ...existing,
    agents,
  };

  writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf-8');
  return readOpenClawStatus();
}

export function ensureOpenClawSkillsDir(): OpenClawStatus {
  const skillsDirPath = resolveHomePath('.openclaw', 'skills', 'cozybase');
  copyTemplateDir(OPENCLAW_SKILLS_TEMPLATE_DIR, skillsDirPath);
  return readOpenClawStatus();
}
