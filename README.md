# difflint

A linter for diffs, not for files.

Most linters check the state of a file. difflint checks the *change*: it
reads a unified diff and only reports on lines that were added, with the
line number they'll have in the resulting file. That's the number you want
when reviewing a PR or writing a pre-push hook — nobody wants a linter that
flags a line you didn't touch because it happened to sit next to your edit.

Right now it catches five things in added lines:

- trailing whitespace
- lines over 120 characters
- leftover `TODO` / `FIXME` / `XXX` markers left in a comment (for
  recognized extensions - `.py`, `.go`, `.rs`, `.sql`, and around thirty
  others - the marker only counts if it's actually inside a `//`, `#`,
  `--`, or `/* */` comment, not a string or identifier; unrecognized
  extensions fall back to matching the marker anywhere on the line)
- CRLF line endings mixed into an otherwise LF file
- indentation that mixes tabs and spaces on the same line

## Usage

Build it (there are no runtime dependencies, so this is the only setup step):

```
npm install --only=dev
npm run build
```

Then point it at a diff, either from a file or piped in:

```
git diff | node dist/cli.js
node dist/cli.js my-change.patch
```

Output looks like:

```
src/server.ts:42  trailing-whitespace  added line has trailing whitespace
src/server.ts:58  todo-marker          added line introduces a TODO marker
```

Exit code is 1 if anything was found, 0 otherwise, so it's usable as a CI
gate or a pre-commit hook:

```
git diff --cached | node dist/cli.js || exit 1
```

Pass `--format json` to get findings as a JSON array on stdout instead,
one object per finding with the same `file`, `line`, `rule`, and `message`
fields as the text output. Useful for feeding the results into another
tool rather than a terminal:

```
git diff | node dist/cli.js --format json
```

## Configuration

By default all five rules run with a 120-character line limit. To change
that, drop a `.difflintrc.json` in your project root (difflint walks up
from the current directory looking for one, so it's found from a
subdirectory too):

```json
{
  "rules": {
    "todo-marker": false
  },
  "maxLineLength": 100
}
```

`rules` is a rule-name-to-boolean map; only entries you list are changed,
so leaving a rule out keeps it enabled. `maxLineLength` sets the threshold
for `line-too-long`. Both keys are optional, and an invalid config (bad
JSON, wrong value types) makes difflint exit with an error rather than
silently ignoring it.

## Using it as a library

`parseDiff` and the individual rules are exported from `dist/index.js` if
you want to run this on parsed diffs yourself, or write a custom rule:

```ts
import { parseDiff, trailingWhitespace } from 'difflint';

const files = parseDiff(diffText);
for (const file of files) {
  console.log(trailingWhitespace.check(file));
}
```

A rule is just `{ name: string, check(file: FileDiff): Finding[] }`, so
adding one is a matter of writing a function and adding it to the list
passed to the CLI.

## What it doesn't do yet

It only looks at added lines — deletions and context lines are parsed but
not linted, since the added side is what you're actually introducing. It
also doesn't know about per-language syntax, so it won't catch anything
that requires actually parsing the code (unused imports, type errors, and
so on). See the roadmap for what's planned.
