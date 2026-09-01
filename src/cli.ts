#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { loadConfig } from './config';
import { parseDiff } from './parser';
import { buildRules, type Finding } from './rules';

type Format = 'text' | 'json';

interface Args {
  format: Format;
  path?: string;
}

function parseArgs(argv: string[]): Args {
  let format: Format = 'text';
  let path: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let formatValue: string | undefined;

    if (arg === '--format') {
      formatValue = argv[++i];
    } else if (arg.startsWith('--format=')) {
      formatValue = arg.slice('--format='.length);
    } else if (arg.startsWith('--')) {
      throw new Error(`difflint: unknown option ${arg}`);
    } else {
      path = arg;
      continue;
    }

    if (formatValue !== 'text' && formatValue !== 'json') {
      throw new Error(`difflint: --format must be "text" or "json", got ${formatValue ?? '(nothing)'}`);
    }
    format = formatValue;
  }

  return { format, path };
}

function readInput(path?: string): string {
  if (path) {
    return readFileSync(path, 'utf8');
  }
  // No path given: read a diff piped in on stdin (e.g. `git diff | difflint`).
  return readFileSync(0, 'utf8');
}

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(2);
  }

  let input: string;
  try {
    input = readInput(args.path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`difflint: could not read input: ${message}`);
    process.exit(2);
  }

  let rules;
  try {
    rules = buildRules(loadConfig());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(2);
  }

  const files = parseDiff(input);
  const findings: Finding[] = [];
  for (const file of files) {
    for (const rule of rules) {
      findings.push(...rule.check(file));
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  if (args.format === 'json') {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    for (const f of findings) {
      console.log(`${f.file}:${f.line}  ${f.rule}  ${f.message}`);
    }
  }

  if (findings.length > 0) {
    console.error(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}`);
    process.exit(1);
  }
}

main();
