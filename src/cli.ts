#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseDiff } from './parser';
import { defaultRules, type Finding } from './rules';

function readInput(): string {
  const arg = process.argv[2];
  if (arg) {
    return readFileSync(arg, 'utf8');
  }
  // No path given: read a diff piped in on stdin (e.g. `git diff | difflint`).
  return readFileSync(0, 'utf8');
}

function main(): void {
  let input: string;
  try {
    input = readInput();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`difflint: could not read input: ${message}`);
    process.exit(2);
  }

  const files = parseDiff(input);
  const findings: Finding[] = [];
  for (const file of files) {
    for (const rule of defaultRules) {
      findings.push(...rule.check(file));
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  for (const f of findings) {
    console.log(`${f.file}:${f.line}  ${f.rule}  ${f.message}`);
  }

  if (findings.length > 0) {
    console.error(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}`);
    process.exit(1);
  }
}

main();
