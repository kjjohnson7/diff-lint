// Optional per-project configuration for rule toggles and thresholds.
// Config files are plain JSON, read with the standard library only, and
// discovered by walking up from the current directory the same way most
// dotfile-based tools do (so `difflint` works from a subdirectory too).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface Config {
  rules?: Record<string, boolean>;
  maxLineLength?: number;
}

const CONFIG_FILENAME = '.difflintrc.json';

export function loadConfig(startDir: string = process.cwd()): Config {
  const path = findConfigFile(startDir);
  if (!path) return {};

  const raw = readFileSync(path, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`difflint: could not parse ${path}: ${message}`);
  }

  return validateConfig(parsed, path);
}

function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function validateConfig(value: unknown, path: string): Config {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`difflint: ${path} must contain a JSON object`);
  }

  const obj = value as Record<string, unknown>;
  const config: Config = {};

  if ('rules' in obj) {
    const rules = obj.rules;
    if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
      throw new Error(`difflint: ${path} "rules" must be an object mapping rule name to boolean`);
    }
    const parsedRules: Record<string, boolean> = {};
    for (const [name, enabled] of Object.entries(rules as Record<string, unknown>)) {
      if (typeof enabled !== 'boolean') {
        throw new Error(`difflint: ${path} "rules.${name}" must be a boolean`);
      }
      parsedRules[name] = enabled;
    }
    config.rules = parsedRules;
  }

  if ('maxLineLength' in obj) {
    const maxLineLength = obj.maxLineLength;
    if (typeof maxLineLength !== 'number' || !Number.isFinite(maxLineLength) || maxLineLength <= 0) {
      throw new Error(`difflint: ${path} "maxLineLength" must be a positive number`);
    }
    config.maxLineLength = maxLineLength;
  }

  return config;
}
