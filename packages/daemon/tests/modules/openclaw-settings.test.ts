import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import {
  COZYBASE_ACPX_COMMAND,
  configureAcpxForCozybase,
  ensureOpenClawSkillsDir,
  readOpenClawStatus,
} from '../../src/modules/settings/openclaw';

describe('OpenClaw settings helpers', () => {
  let tempHome: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'cozybase-openclaw-test-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = previousHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  test('configures cozybase command without overwriting existing user config', () => {
    const configDir = join(tempHome, '.acpx');
    const configPath = join(configDir, 'config.json');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        defaultAgent: 'assistant',
        agents: {
          assistant: { command: 'assistant run' },
          cozybase: { command: 'legacy cozybase', description: 'keep me' },
        },
      }, null, 2),
      'utf-8',
    );

    const status = configureAcpxForCozybase();
    const nextConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const agents = nextConfig.agents as Record<string, Record<string, unknown>>;

    expect(status.acpxConfigValid).toBe(true);
    expect(nextConfig.defaultAgent).toBe('assistant');
    expect(agents.assistant).toEqual({ command: 'assistant run' });
    expect(agents.cozybase?.command).toBe(COZYBASE_ACPX_COMMAND);
    expect(agents.cozybase?.description).toBe('keep me');
  });

  test('initializes missing config via acpx config init before applying cozybase command', () => {
    let initCalled = 0;

    const status = configureAcpxForCozybase({
      runAcpxInit: () => {
        initCalled += 1;
        const configDir = join(tempHome, '.acpx');
        mkdirSync(configDir, { recursive: true });
        writeFileSync(join(configDir, 'config.json'), JSON.stringify({ agents: {} }, null, 2), 'utf-8');
        return {
          success: true,
          exitCode: 0,
          stderr: '',
        };
      },
    });

    expect(initCalled).toBe(1);
    expect(existsSync(join(tempHome, '.acpx', 'config.json'))).toBe(true);
    expect(status.acpxConfigValid).toBe(true);
    expect(readOpenClawStatus().acpxConfigValid).toBe(true);
  });

  test('copies OpenClaw skills templates into ~/.openclaw/skills/cozybase', () => {
    mkdirSync(join(tempHome, '.openclaw'), { recursive: true });
    const customFile = join(tempHome, '.openclaw', 'skills', 'cozybase', 'custom-note.txt');
    mkdirSync(join(tempHome, '.openclaw', 'skills', 'cozybase'), { recursive: true });
    writeFileSync(customFile, 'keep me', 'utf-8');

    const status = ensureOpenClawSkillsDir();

    expect(status.skillsDirExists).toBe(true);
    expect(status.skillFileExists).toBe(true);
    const skillText = readFileSync(join(tempHome, '.openclaw', 'skills', 'cozybase', 'SKILL.md'), 'utf-8');
    expect(skillText).toContain('title: CozyBase App Agent');
    expect(skillText).toContain('`acpx cozybase exec "<Prompt text>"`');
    expect(readFileSync(customFile, 'utf-8')).toBe('keep me');
  });

  test('does not report skills template as ready when only the directory exists', () => {
    mkdirSync(join(tempHome, '.openclaw', 'skills', 'cozybase'), { recursive: true });

    const status = readOpenClawStatus();

    expect(status.skillsDirExists).toBe(true);
    expect(status.skillFileExists).toBe(false);
  });
});
