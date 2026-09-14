'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installHook } = require('../dist/install-hook');

// Each test gets its own throwaway repo-shaped directory so hook files
// never leak between tests or touch this repo's real .git/hooks.
function makeRepoDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'difflint-hook-test-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

test('installs a pre-commit hook into .git/hooks', (t) => {
  const dir = makeRepoDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const result = installHook(dir);
  assert.equal(result.action, 'installed');
  assert.equal(result.hookPath, path.join(dir, '.git', 'hooks', 'pre-commit'));

  const contents = fs.readFileSync(result.hookPath, 'utf8');
  assert.match(contents, /^#!\/bin\/sh/);
  assert.match(contents, /difflint/);
});

test('marks the installed hook executable', (t) => {
  const dir = makeRepoDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const result = installHook(dir);
  const mode = fs.statSync(result.hookPath).mode & 0o777;
  assert.equal(mode, 0o755);
});

test('creates the hooks directory if it does not exist yet', (t) => {
  const dir = makeRepoDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(fs.existsSync(path.join(dir, '.git', 'hooks')), false);
  installHook(dir);
  assert.equal(fs.existsSync(path.join(dir, '.git', 'hooks')), true);
});

test('re-running the installer replaces a hook it wrote itself', (t) => {
  const dir = makeRepoDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  installHook(dir);
  const result = installHook(dir);
  assert.equal(result.action, 'replaced');
});

test('refuses to overwrite a pre-existing unrelated hook', (t) => {
  const dir = makeRepoDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const hooksDir = path.join(dir, '.git', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\necho custom hook\n');

  assert.throws(() => installHook(dir), /already exists/);
});

test('--force overwrites a pre-existing unrelated hook', (t) => {
  const dir = makeRepoDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const hooksDir = path.join(dir, '.git', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\necho custom hook\n');

  const result = installHook(dir, true);
  assert.equal(result.action, 'replaced');
  assert.match(fs.readFileSync(result.hookPath, 'utf8'), /difflint/);
});

test('follows a .git file to the real git dir (worktrees/submodules)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'difflint-hook-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const realGitDir = path.join(dir, 'main-repo', '.git', 'worktrees', 'feature');
  fs.mkdirSync(realGitDir, { recursive: true });

  const worktreeDir = path.join(dir, 'feature-worktree');
  fs.mkdirSync(worktreeDir);
  fs.writeFileSync(path.join(worktreeDir, '.git'), `gitdir: ${realGitDir}\n`);

  const result = installHook(worktreeDir);
  assert.equal(result.hookPath, path.join(realGitDir, 'hooks', 'pre-commit'));
});

test('throws when no .git directory is found', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'difflint-hook-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // A tmp dir has no .git anywhere above it (unlike this repo's own tree),
  // so walking up must eventually give up rather than looping forever.
  assert.throws(() => installHook(dir), /no \.git directory found/);
});
