#!/usr/bin/env node
// Installs a pre-commit hook that runs difflint against staged changes.
// Kept separate from cli.ts because it mutates .git rather than linting,
// and other tools (husky, lint-staged) shouldn't be pulled in for this.

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const HOOK_NAME = 'pre-commit';

// Written into the hook file so a re-run of this script can recognize and
// safely overwrite a hook it installed earlier, without touching a hook
// that was already there for some other reason.
const MARKER = '# installed-by: difflint';

const HOOK_SCRIPT = `#!/bin/sh
${MARKER}
git diff --cached | npx --no-install difflint
`;

export interface InstallResult {
  hookPath: string;
  action: 'installed' | 'replaced';
}

export function installHook(startDir: string = process.cwd(), force = false): InstallResult {
  const gitDir = resolveGitDir(startDir);
  const hooksDir = join(gitDir, 'hooks');
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = join(hooksDir, HOOK_NAME);
  let action: InstallResult['action'] = 'installed';

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf8');
    if (!existing.includes(MARKER) && !force) {
      throw new Error(
        `difflint: ${hookPath} already exists and wasn't installed by difflint.\n` +
          `Remove it or re-run with --force to overwrite it.`,
      );
    }
    action = 'replaced';
  }

  writeFileSync(hookPath, HOOK_SCRIPT);
  chmodSync(hookPath, 0o755);

  return { hookPath, action };
}

function resolveGitDir(startDir: string): string {
  const dotGit = findDotGit(resolve(startDir));
  const stat = statSync(dotGit);
  if (stat.isDirectory()) return dotGit;

  // A worktree or submodule replaces .git with a file containing a
  // "gitdir: <path>" pointer to the real one, so follow that instead.
  const contents = readFileSync(dotGit, 'utf8').trim();
  const match = contents.match(/^gitdir: (.+)$/);
  if (!match) {
    throw new Error(`difflint: could not parse ${dotGit}`);
  }
  return resolve(dirname(dotGit), match[1]);
}

function findDotGit(startDir: string): string {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, '.git');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('difflint: no .git directory found (are you inside a git repository?)');
    }
    dir = parent;
  }
}

function main(): void {
  const force = process.argv.slice(2).includes('--force');

  let result: InstallResult;
  try {
    result = installHook(process.cwd(), force);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }

  const verb = result.action === 'installed' ? 'Installed' : 'Replaced';
  console.log(`${verb} pre-commit hook at ${result.hookPath}`);
}

if (require.main === module) {
  main();
}
