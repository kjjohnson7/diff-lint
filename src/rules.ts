import type { FileDiff } from './parser';

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

export const todoMarker: Rule = {
  name: 'todo-marker',
  check(file) {
    const findings: Finding[] = [];
    for (const { text, line } of addedLines(file)) {
      const match = /\b(TODO|FIXME|XXX)\b/.exec(text);
      if (match) {
        findings.push({
          file: file.path,
          line,
          rule: 'todo-marker',
          message: `added line introduces a ${match[1]} marker`,
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

export const defaultRules: Rule[] = [trailingWhitespace, lineTooLong(), todoMarker, carriageReturn];
