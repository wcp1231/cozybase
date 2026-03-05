import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, lstatSync, readlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initWorkspace } from '../../src/workspace-init';

describe('initWorkspace', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('creates AGENTS.md and CLAUDE.md symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    const result = initWorkspace(root);

    expect(result.created).toContain('AGENTS.md');
    expect(result.created).toContain('CLAUDE.md');
    expect(existsSync(join(root, 'AGENTS.md'))).toBeTrue();
    expect(lstatSync(join(root, 'AGENTS.md')).isFile()).toBeTrue();
    expect(lstatSync(join(root, 'CLAUDE.md')).isSymbolicLink()).toBeTrue();
    expect(readlinkSync(join(root, 'CLAUDE.md'))).toBe('AGENTS.md');
    expect(existsSync(join(root, 'AGENT.md'))).toBeFalse();
  });
});
