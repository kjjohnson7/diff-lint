import { extname } from 'node:path';
import type { FileDiff } from './parser';
import type { Config } from './config';

export interface Finding {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export interface Rule {
  name: string;
  check(file: FileDiff): Finding[];
}

function addedLines(file: FileDiff): { text: string; line: number }[] {
  const result: { text: string; line: number }[] = [];
  for (const hunk of file.hunks) {
    for (const l of hunk.lines) {
      if (l.type === 'add' && l.newLine !== undefined) {
        result.push({ text: l.text, line: l.newLine });
      }
    }
  }
  return result;
}

export const trailingWhitespace: Rule = {
  name: 'trailing-whitespace',
  check(file) {
    const findings: Finding[] = [];
    for (const { text, line } of addedLines(file)) {
      if (/[ \t]+$/.test(text)) {
        findings.push({
          file: file.path,
          line,
          rule: 'trailing-whitespace',
          message: 'added line has trailing whitespace',
        });
      }
    }
    return findings;
  },
};

export function lineTooLong(maxLength = 120): Rule {
  return {
    name: 'line-too-long',
    check(file) {
      const findings: Finding[] = [];
      for (const { text, line } of addedLines(file)) {
        if (text.length > maxLength) {
          findings.push({
            file: file.path,
            line,
            rule: 'line-too-long',
            message: `added line is ${text.length} characters, longer than ${maxLength}`,
          });
        }
      }
      return findings;
    },
  };
}

// Line-comment tokens by file extension. Where a language supports more
// than one (PHP allows both // and #), all of them count.
const LINE_COMMENT_TOKENS: Record<string, string[]> = {
  '.js': ['//'],
  '.jsx': ['//'],
  '.ts': ['//'],
  '.tsx': ['//'],
  '.mjs': ['//'],
  '.cjs': ['//'],
  '.c': ['//'],
  '.h': ['//'],
  '.cpp': ['//'],
  '.hpp': ['//'],
  '.cc': ['//'],
  '.java': ['//'],
  '.go': ['//'],
  '.rs': ['//'],
  '.swift': ['//'],
  '.kt': ['//'],
  '.scala': ['//'],
  '.php': ['//', '#'],
  '.py': ['#'],
  '.rb': ['#'],
  '.sh': ['#'],
  '.bash': ['#'],
  '.zsh': ['#'],
  '.yml': ['#'],
  '.yaml': ['#'],
  '.toml': ['#'],
  '.pl': ['#'],
  '.sql': ['--'],
  '.lua': ['--'],
  '.hs': ['--'],
  '.el': [';'],
  '.clj': [';'],
  '.lisp': [';'],
};

// Block-comment openers by extension. Only used to detect a comment that
// both opens and (implicitly, on the same line) could contain the marker -
// we don't track multi-line comment state across a hunk.
const BLOCK_COMMENT_OPEN: Record<string, string> = {
  '.js': '/*',
  '.jsx': '/*',
  '.ts': '/*',
  '.tsx': '/*',
  '.mjs': '/*',
  '.cjs': '/*',
  '.c': '/*',
  '.h': '/*',
  '.cpp': '/*',
  '.hpp': '/*',
  '.cc': '/*',
  '.java': '/*',
  '.go': '/*',
  '.rs': '/*',
  '.swift': '/*',
  '.kt': '/*',
  '.scala': '/*',
  '.php': '/*',
  '.css': '/*',
  '.scss': '/*',
  '.less': '/*',
};

// Index of the earliest comment opener on the line, or -1 if none of the
// tokens known for this extension appear.
function earliestCommentIndex(text: string, ext: string): number {
  let earliest = -1;
  for (const token of LINE_COMMENT_TOKENS[ext] ?? []) {
    const idx = text.indexOf(token);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
  }
  const blockToken = BLOCK_COMMENT_OPEN[ext];
  if (blockToken) {
    const idx = text.indexOf(blockToken);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
  }
  return earliest;
}

export const todoMarker: Rule = {
  name: 'todo-marker',
  check(file) {
    const findings: Finding[] = [];
    const ext = extname(file.path);
    const known = ext in LINE_COMMENT_TOKENS || ext in BLOCK_COMMENT_OPEN;
    for (const { text, line } of addedLines(file)) {
      const match = /\b(TODO|FIXME|XXX)\b/.exec(text);
      if (!match) continue;
      // For a recognized language, only count the marker if it sits inside
      // a comment - a TODO in a string literal or identifier isn't one we
      // want reported. Unrecognized extensions fall back to matching
      // anywhere on the line, since we have no comment syntax to check.
      if (known) {
        const commentIndex = earliestCommentIndex(text, ext);
        if (commentIndex === -1 || commentIndex > match.index) continue;
      }
      findings.push({
        file: file.path,
        line,
        rule: 'todo-marker',
        message: `added line introduces a ${match[1]} marker`,
      });
    }
    return findings;
  },
};

export const mixedIndentation: Rule = {
  name: 'mixed-indentation',
  check(file) {
    const findings: Finding[] = [];
    for (const { text, line } of addedLines(file)) {
      const leading = /^[ \t]+/.exec(text);
      if (!leading) continue;
      const indent = leading[0];
      if (indent.includes(' ') && indent.includes('\t')) {
        findings.push({
          file: file.path,
          line,
          rule: 'mixed-indentation',
          message: 'added line mixes tabs and spaces in its indentation',
        });
      }
    }
    return findings;
  },
};

export const carriageReturn: Rule = {
  name: 'carriage-return',
  check(file) {
    const findings: Finding[] = [];
    for (const { text, line } of addedLines(file)) {
      if (text.endsWith('\r')) {
        findings.push({
          file: file.path,
          line,
          rule: 'carriage-return',
          message: 'added line ends with a carriage return (CRLF)',
        });
      }
    }
    return findings;
  },
};

export const defaultRules: Rule[] = [
  trailingWhitespace,
  lineTooLong(),
  todoMarker,
  carriageReturn,
  mixedIndentation,
];

// Builds the rule set for a run: applies the configured line-length
// threshold, then drops any rule explicitly set to `false` in config.
// Rules are enabled unless a config says otherwise, so an empty or
// partial `rules` block doesn't silently turn everything off.
export function buildRules(config: Config = {}): Rule[] {
  const all: Rule[] = [
    trailingWhitespace,
    lineTooLong(config.maxLineLength),
    todoMarker,
    carriageReturn,
    mixedIndentation,
  ];
  const toggles = config.rules ?? {};
  return all.filter((rule) => toggles[rule.name] !== false);
}
