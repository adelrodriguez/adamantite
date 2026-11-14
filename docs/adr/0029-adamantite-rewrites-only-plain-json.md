# Adamantite rewrites only plain JSON

Adamantite read the JSON files of a target project with `jsonc-parser`, and edited them in place
with its `modify` function. The edit kept the comments, the indentation, and the key order of
`tsconfig.json`, `.vscode/settings.json`, and `.zed/settings.json`. Issue #799 removes
`jsonc-parser`, because Effect, which Adamantite already uses, has `Jsonc.parse` and
`Json5.parse` in `effect/encoding`. Effect has no function that writes a value back into text with
comments.

We decided (2026-11-13, issue #799) that each call site reads its file with the Effect parser that
fits the file, and that Adamantite rewrites a file only when it is plain JSON. Adamantite has no
first-party JSON parser or editor.

## How each file is read and written

| File                                                                               | Read with     | Write                                                                      |
| ---------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------- |
| `package.json`, `skills-lock.json`, Effect SDK metadata, `tsc --showConfig` output | `Jsonc.parse` | The whole value with `writeJsonFile`                                       |
| `tsconfig.json`, `.vscode/settings.json`, `.zed/settings.json`                     | `Json5.parse` | The whole value with `writeJsonFile`, only when `checkIsPlainJson` is true |

`tsc`, VS Code, and Zed accept a trailing comma, and `Jsonc.parse` rejects it. `Json5.parse`
accepts it. `Json5.parse` also accepts syntax that these tools reject, such as single quotes, but
Adamantite only reads these files, and the tools report that syntax themselves.

When one of these files has comments or a trailing comma, the update fails with
`JsoncNotEditable`. The error states the change to make by hand. `adamantite init` shows it as a
warning and continues with the next step. This follows ADR 0002: Adamantite gives the
instruction, and the user or an agent changes the file.

`mergeConfig` keeps the key order of the project file, so a rewrite of a plain file does not
reorder the keys.

## Considered options

- Keep `jsonc-parser`. It keeps the in-place edits, at a cost of 213 kB in each target project.
  Issue #799 removes it.
- A first-party tokenizer and editor next to `Jsonc.parse`. It keeps the in-place edits, but it
  needs a step that removes trailing commas before the parse, and two parsers that must agree. The
  estimate was 400 to 500 lines of source.
- A first-party lossless syntax tree with a reconcile step. It keeps the in-place edits with one
  parser, but no caller removes keys, so most of the tree serves no caller.

## Consequences

- A `tsconfig.json` from `tsc --init` or from the Bun template has comments, so init does not add
  `extends` to it. Init prints the `extends` value to set.
- A plain file is written with two-space indentation, and one-line arrays move to several lines.
  Oxfmt formats the file again when the project formats JSON.
- A parse error shows the line and column from Effect, such as
  `Invalid JSONC at line 3, column 3`, in place of up to three error codes with offsets.
- `Jsonc` and `Json5` are unstable in Effect 4.1.2. Adamantite pins the Effect version, so a
  change to them arrives only with an upgrade.
