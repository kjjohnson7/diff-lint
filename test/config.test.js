'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../dist/config');

// Each test gets its own throwaway directory so config files never leak
// between tests or collide with the real .difflintrc.json in this repo.
function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'difflint-config-test-'));
}

function withConfig(dir, contents) {
  fs.writeFileSync(path.join(dir, '.difflintrc.json'), contents);
}

test('returns an empty config when no .difflintrc.json is found', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.deepEqual(loadConfig(dir), {});
});

test('reads rule toggles and maxLineLength from a valid config', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  withConfig(dir, JSON.stringify({ rules: { 'todo-marker': false }, maxLineLength: 100 }));
  const config = loadConfig(dir);
  assert.deepEqual(config, { rules: { 'todo-marker': false }, maxLineLength: 100 });
});

test('finds a config file by walking up from a subdirectory', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  withConfig(dir, JSON.stringify({ maxLineLength: 80 }));
  const subDir = path.join(dir, 'src', 'nested');
  fs.mkdirSync(subDir, { recursive: true });

  assert.deepEqual(loadConfig(subDir), { maxLineLength: 80 });
});

test('throws on invalid JSON', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  withConfig(dir, '{ not valid json');
  assert.throws(() => loadConfig(dir), /could not parse/);
});

test('throws when "rules" is not an object of booleans', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  withConfig(dir, JSON.stringify({ rules: { 'todo-marker': 'off' } }));
  assert.throws(() => loadConfig(dir), /"rules\.todo-marker" must be a boolean/);
});

test('throws when maxLineLength is not a positive number', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  withConfig(dir, JSON.stringify({ maxLineLength: -5 }));
  assert.throws(() => loadConfig(dir), /"maxLineLength" must be a positive number/);
});

test('an explicit config path overrides discovery', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Not named .difflintrc.json and not in a discoverable location.
  const customPath = path.join(dir, 'custom-config.json');
  fs.writeFileSync(customPath, JSON.stringify({ maxLineLength: 42 }));

  assert.deepEqual(loadConfig(dir, customPath), { maxLineLength: 42 });
});

test('an explicit config path wins even when a discoverable config exists', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  withConfig(dir, JSON.stringify({ maxLineLength: 80 }));
  const customPath = path.join(dir, 'custom-config.json');
  fs.writeFileSync(customPath, JSON.stringify({ maxLineLength: 42 }));

  assert.deepEqual(loadConfig(dir, customPath), { maxLineLength: 42 });
});

test('throws when the explicit config path does not exist', (t) => {
  const dir = makeTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const missingPath = path.join(dir, 'missing.json');
  assert.throws(() => loadConfig(dir, missingPath), /config file not found/);
});
