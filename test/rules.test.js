'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  trailingWhitespace,
  lineTooLong,
  todoMarker,
  carriageReturn,
  mixedIndentation,
  buildRules,
} = require('../dist/rules');

// Builds a minimal FileDiff with a single hunk holding the given added
// lines, so each rule can be exercised without going through the parser.
function fileWithAddedLines(path, texts) {
  return {
    path,
    hunks: [
      {
        oldStart: 1,
        newStart: 1,
        lines: texts.map((text, i) => ({ type: 'add', text, newLine: i + 1 })),
      },
    ],
  };
}

test('trailingWhitespace flags trailing spaces and tabs but not clean lines', () => {
  const file = fileWithAddedLines('a.js', ['clean', 'trailing space ', 'trailing tab\t']);
  const findings = trailingWhitespace.check(file);
  assert.deepEqual(findings.map((f) => f.line), [2, 3]);
  assert.equal(findings[0].rule, 'trailing-whitespace');
});

test('lineTooLong uses a 120 character default and a configurable threshold', () => {
  const shortLine = 'x'.repeat(50);
  const longLine = 'x'.repeat(150);
  const file = fileWithAddedLines('a.js', [shortLine, longLine]);

  const defaultFindings = lineTooLong().check(file);
  assert.deepEqual(defaultFindings.map((f) => f.line), [2]);

  const strictFindings = lineTooLong(40).check(file);
  assert.deepEqual(strictFindings.map((f) => f.line), [1, 2]);
});

test('todoMarker only counts markers inside comments for recognized extensions', () => {
  const file = fileWithAddedLines('a.js', [
    'const todo = "TODO: not a marker, just a string with no comment";',
    '// TODO: fix this properly',
    'doStuff(); // FIXME later',
  ]);
  const findings = todoMarker.check(file);
  assert.deepEqual(findings.map((f) => f.line), [2, 3]);
});

test('todoMarker matches anywhere on the line for unrecognized extensions', () => {
  const file = fileWithAddedLines('notes.md', ['TODO: write the release notes']);
  const findings = todoMarker.check(file);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
});

test('carriageReturn flags lines ending in \\r', () => {
  const file = fileWithAddedLines('a.txt', ['unix line', 'windows line\r']);
  const findings = carriageReturn.check(file);
  assert.deepEqual(findings.map((f) => f.line), [2]);
});

test('mixedIndentation flags leading whitespace with both tabs and spaces', () => {
  const file = fileWithAddedLines('a.py', ['    spaces only', '\t\ttabs only', '\t  mixed']);
  const findings = mixedIndentation.check(file);
  assert.deepEqual(findings.map((f) => f.line), [3]);
});

test('buildRules enables all rules by default', () => {
  const rules = buildRules();
  assert.deepEqual(
    rules.map((r) => r.name).sort(),
    ['carriage-return', 'line-too-long', 'mixed-indentation', 'todo-marker', 'trailing-whitespace'].sort(),
  );
});

test('buildRules drops rules explicitly disabled in config and applies maxLineLength', () => {
  const rules = buildRules({ rules: { 'todo-marker': false }, maxLineLength: 10 });
  assert.ok(!rules.some((r) => r.name === 'todo-marker'));

  const file = fileWithAddedLines('a.js', ['x'.repeat(20)]);
  const lengthRule = rules.find((r) => r.name === 'line-too-long');
  assert.equal(lengthRule.check(file).length, 1);
});
