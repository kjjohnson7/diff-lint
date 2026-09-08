'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDiff } = require('../dist/parser');

test('parses added, deleted, and context lines with resolved line numbers', () => {
  const diff = [
    'diff --git a/src/foo.js b/src/foo.js',
    'index abc123..def456 100644',
    '--- a/src/foo.js',
    '+++ b/src/foo.js',
    '@@ -1,3 +1,4 @@',
    ' line one',
    '-old line',
    '+new line',
    '+added line',
    ' line three',
    '',
  ].join('\n');

  const files = parseDiff(diff);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'src/foo.js');

  const hunk = files[0].hunks[0];
  assert.equal(hunk.oldStart, 1);
  assert.equal(hunk.newStart, 1);
  assert.deepEqual(
    hunk.lines.map((l) => [l.type, l.text, l.oldLine, l.newLine]),
    [
      ['context', 'line one', 1, 1],
      ['del', 'old line', 2, undefined],
      ['add', 'new line', undefined, 2],
      ['add', 'added line', undefined, 3],
      ['context', 'line three', 3, 4],
    ],
  );
});

test('strips the a/ and b/ path prefixes but keeps /dev/null as-is', () => {
  const diff = [
    'diff --git a/new-file.txt b/new-file.txt',
    'new file mode 100644',
    'index 0000000..abc123',
    '--- /dev/null',
    '+++ b/new-file.txt',
    '@@ -0,0 +1,1 @@',
    '+hello',
    '',
  ].join('\n');

  const files = parseDiff(diff);
  assert.equal(files[0].path, 'new-file.txt');
  assert.equal(files[0].hunks[0].lines[0].newLine, 1);
});

test('parses multiple files and multiple hunks per file', () => {
  const diff = [
    'diff --git a/one.js b/one.js',
    '--- a/one.js',
    '+++ b/one.js',
    '@@ -1,1 +1,2 @@',
    ' kept',
    '+added in one',
    '@@ -10,1 +11,2 @@',
    ' kept again',
    '+added again in one',
    'diff --git a/two.js b/two.js',
    '--- a/two.js',
    '+++ b/two.js',
    '@@ -1,1 +1,2 @@',
    ' kept',
    '+added in two',
    '',
  ].join('\n');

  const files = parseDiff(diff);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, 'one.js');
  assert.equal(files[0].hunks.length, 2);
  assert.equal(files[0].hunks[1].lines[1].newLine, 12);
  assert.equal(files[1].path, 'two.js');
  assert.equal(files[1].hunks[0].lines[1].text, 'added in two');
});

test('ignores "no newline at end of file" markers and lines before the first hunk', () => {
  const diff = [
    'diff --git a/foo.js b/foo.js',
    '--- a/foo.js',
    '+++ b/foo.js',
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
    '\\ No newline at end of file',
    '',
  ].join('\n');

  const files = parseDiff(diff);
  assert.equal(files[0].hunks[0].lines.length, 2);
});

test('returns no files for input with no diff content', () => {
  assert.deepEqual(parseDiff(''), []);
});
