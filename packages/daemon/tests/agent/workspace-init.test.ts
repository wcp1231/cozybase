import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  lstatSync,
  readlinkSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  unlinkSync,
} from 'fs';
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

  test('creates AGENTS.md and links CLAUDE.md/.claude to AGENTS.md/.agents', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    const result = initWorkspace(root);

    expect(result.created).toContain('AGENTS.md');
    expect(result.created).toContain('CLAUDE.md');
    expect(result.created).toContain('.agents/skills/create-app/SKILL.md');
    expect(result.created).toContain('.claude');
    expect(existsSync(join(root, 'AGENTS.md'))).toBeTrue();
    expect(existsSync(join(root, '.agents/skills/create-app/SKILL.md'))).toBeTrue();
    expect(lstatSync(join(root, 'AGENTS.md')).isFile()).toBeTrue();
    expect(lstatSync(join(root, 'CLAUDE.md')).isSymbolicLink()).toBeTrue();
    expect(lstatSync(join(root, '.claude')).isSymbolicLink()).toBeTrue();
    expect(readlinkSync(join(root, 'CLAUDE.md'))).toBe('AGENTS.md');
    expect(readlinkSync(join(root, '.claude'))).toBe('.agents');
    expect(existsSync(join(root, 'AGENT.md'))).toBeFalse();
  });

  test('second init overwrites changed template files', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);

    const agentsPath = join(root, 'AGENTS.md');
    writeFileSync(agentsPath, 'user modified content');

    const result = initWorkspace(root);

    expect(result.updated).toContain('AGENTS.md');
    expect(readFileSync(agentsPath, 'utf-8')).not.toBe('user modified content');
  });

  test('second init skips unchanged files', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);
    const result = initWorkspace(root);

    expect(result.created.filter(f => f !== 'CLAUDE.md' && f !== '.claude')).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  test('removes files deleted from template via manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);

    const manifestPath = join(root, '.agents/.template-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as string[];
    const fakeFile = '.agents/skills/obsolete-skill/SKILL.md';
    manifest.push(fakeFile);
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const fakePath = join(root, fakeFile);
    mkdirSync(join(root, '.agents/skills/obsolete-skill'), { recursive: true });
    writeFileSync(fakePath, 'obsolete');

    const result = initWorkspace(root);

    expect(result.removed).toContain(fakeFile);
    expect(existsSync(fakePath)).toBeFalse();
  });

  test('cleans up empty directories after removing stale files', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);

    const manifestPath = join(root, '.agents/.template-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as string[];
    const fakeFile = '.agents/skills/temp-dir/SKILL.md';
    manifest.push(fakeFile);
    writeFileSync(manifestPath, JSON.stringify(manifest));

    mkdirSync(join(root, '.agents/skills/temp-dir'), { recursive: true });
    writeFileSync(join(root, fakeFile), 'temp');

    initWorkspace(root);

    expect(existsSync(join(root, '.agents/skills/temp-dir'))).toBeFalse();
  });

  test('manifest file records all template-managed files', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);

    const manifestPath = join(root, '.agents/.template-manifest.json');
    expect(existsSync(manifestPath)).toBeTrue();

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as string[];
    expect(manifest).toContain('AGENTS.md');
    expect(manifest).toContain('.agents/skills/create-app/SKILL.md');
    expect(manifest).not.toContain('CLAUDE.md');
    expect(manifest).not.toContain('.claude');
  });

  test('does not delete user-created files outside manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);

    const userFile = join(root, '.agents/skills/my-custom-skill/SKILL.md');
    mkdirSync(join(root, '.agents/skills/my-custom-skill'), { recursive: true });
    writeFileSync(userFile, 'my custom skill');

    const result = initWorkspace(root);

    expect(result.removed).not.toContain('.agents/skills/my-custom-skill/SKILL.md');
    expect(existsSync(userFile)).toBeTrue();
    expect(readFileSync(userFile, 'utf-8')).toBe('my custom skill');
  });

  // --- Security tests ---

  test('replaces symlink with regular file during copy', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);

    const externalFile = join(root, '..', 'external-target.txt');
    writeFileSync(externalFile, 'external content');

    const agentsPath = join(root, 'AGENTS.md');
    unlinkSync(agentsPath);
    symlinkSync(externalFile, agentsPath);

    const result = initWorkspace(root);

    expect(lstatSync(agentsPath).isFile()).toBeTrue();
    expect(lstatSync(agentsPath).isSymbolicLink()).toBeFalse();
    expect(readFileSync(externalFile, 'utf-8')).toBe('external content');
    expect(result.created).toContain('AGENTS.md');

    rmSync(externalFile, { force: true });
  });

  test('manifest with path-traversal entries does not delete outside targetDir', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);

    const externalFile = join(root, '..', 'should-not-delete.txt');
    writeFileSync(externalFile, 'important');

    const manifestPath = join(root, '.agents/.template-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as string[];
    manifest.push('../should-not-delete.txt');
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const result = initWorkspace(root);

    expect(existsSync(externalFile)).toBeTrue();
    expect(result.removed).not.toContain('../should-not-delete.txt');

    rmSync(externalFile, { force: true });
  });

  test('symlinked parent directory does not allow writing outside targetDir', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);
    const externalDir = mkdtempSync(join(tmpdir(), 'cozybase-external-'));
    dirs.push(externalDir);

    initWorkspace(root);

    // Replace .agents/skills with a symlink to an external directory
    const skillsDir = join(root, '.agents', 'skills');
    rmSync(skillsDir, { recursive: true, force: true });
    symlinkSync(externalDir, skillsDir);

    const result = initWorkspace(root);

    // The symlink should have been replaced with a real directory
    expect(lstatSync(skillsDir).isSymbolicLink()).toBeFalse();
    expect(lstatSync(skillsDir).isDirectory()).toBeTrue();
    // External directory should be empty (nothing written to it)
    const { readdirSync } = require('fs');
    expect(readdirSync(externalDir)).toHaveLength(0);
  });

  test('handles destination path occupied by a directory instead of a file', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);

    // Replace AGENTS.md (a file) with a directory
    const agentsPath = join(root, 'AGENTS.md');
    unlinkSync(agentsPath);
    mkdirSync(agentsPath);
    writeFileSync(join(agentsPath, 'nested.txt'), 'nested');

    // Should not crash — the directory should be removed and replaced with the file
    const result = initWorkspace(root);

    expect(lstatSync(agentsPath).isFile()).toBeTrue();
    expect(result.created).toContain('AGENTS.md');
  });

  // --- Migration tests ---

  test('first upgrade from pre-manifest workspace creates manifest without deleting unknown skills', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);
    const manifestPath = join(root, '.agents/.template-manifest.json');

    // Simulate pre-manifest workspace: remove manifest, add an unknown skill
    unlinkSync(manifestPath);
    const customFile = '.agents/skills/my-custom-skill/SKILL.md';
    const customPath = join(root, customFile);
    mkdirSync(join(root, '.agents/skills/my-custom-skill'), { recursive: true });
    writeFileSync(customPath, 'custom skill');

    const result = initWorkspace(root);

    expect(existsSync(manifestPath)).toBeTrue();
    expect(existsSync(customPath)).toBeTrue();
    expect(result.removed).not.toContain(customFile);
  });

  test('bootstrap manifest does not remove user files outside template directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'cozybase-init-'));
    dirs.push(root);

    initWorkspace(root);
    const manifestPath = join(root, '.agents/.template-manifest.json');

    // Remove manifest and add a user file in a non-template directory
    unlinkSync(manifestPath);
    const userDir = join(root, 'my-stuff');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'notes.txt'), 'user notes');

    const result = initWorkspace(root);

    // User file in non-template directory should not be touched
    expect(existsSync(join(userDir, 'notes.txt'))).toBeTrue();
    expect(result.removed).not.toContain('my-stuff/notes.txt');
  });
});
