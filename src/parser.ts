// Parses unified diff text (git diff or plain `diff -u` output) into a
// per-file, per-hunk structure with line numbers resolved against the new
// file, so lint rules never have to recompute offsets themselves.

export type LineType = 'add' | 'del' | 'context';

export interface DiffLine {
  type: LineType;
  text: string;
  newLine?: number;
  oldLine?: number;
}

export interface Hunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  hunks: Hunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseDiff(input: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of input.split('\n')) {
    if (raw.startsWith('diff --git') || raw.startsWith('index ')) {
      continue;
    }
    if (raw.startsWith('--- ')) {
      // Old-side path is only relevant for deletions, which we don't lint.
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const path = stripPathPrefix(raw.slice(4).trim().split('\t')[0]);
      current = { path, hunks: [] };
      files.push(current);
      hunk = null;
      continue;
    }

    const header = HUNK_HEADER.exec(raw);
    if (header && current) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk = { oldStart: oldLine, newStart: newLine, lines: [] };
      current.hunks.push(hunk);
      continue;
    }

    if (!hunk) continue;
    if (raw.startsWith('\\')) continue; // "\ No newline at end of file"

    if (raw.startsWith('+')) {
      hunk.lines.push({ type: 'add', text: raw.slice(1), newLine: newLine++ });
    } else if (raw.startsWith('-')) {
      hunk.lines.push({ type: 'del', text: raw.slice(1), oldLine: oldLine++ });
    } else if (raw.startsWith(' ')) {
      hunk.lines.push({ type: 'context', text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }

  return files;
}

function stripPathPrefix(path: string): string {
  if (path === '/dev/null') return path;
  return path.replace(/^[ab]\//, '');
}

// Wraps a whole file's contents in the same FileDiff shape parseDiff
// produces, with every line treated as added, so rules can run over a
// working-tree file without a diff to compare it against.
export function fileToDiff(path: string, content: string): FileDiff {
  const lines = content.split('\n');
  // A trailing newline is the normal case and splits into a trailing empty
  // element; drop it so an N-line file reports N lines, not N+1.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const hunk: Hunk = {
    oldStart: 0,
    newStart: 1,
    lines: lines.map((text, i) => ({ type: 'add' as const, text, newLine: i + 1 })),
  };

  return { path, hunks: [hunk] };
}
