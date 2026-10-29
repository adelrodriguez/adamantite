# Avoided glossary terms are an opt-in first-party rule

Adamantite, packref, and 100times each list terms to avoid in `GLOSSARY.md`, and no tool checked
them. We decided (2026-10-29, issue #548) that a first-party rule, `adamantite/no-avoided-terms`,
reads the nearest `GLOSSARY.md` and reports declared names and JSX text that use an avoided term.
The `strict` preset loads the rule and does not turn it on.

## Spike

We ran a first version on the four projects. It reported each avoided term in declared names,
property keys, and string literals, and skipped imports and member access. v1 has no
`GLOSSARY.md`, so it has nothing to check.

| Project    | Files | Avoided terms | Reports | Outside tests |
| ---------- | ----: | ------------: | ------: | ------------: |
| Adamantite |   173 |            56 |    2106 |           971 |
| packref    |    87 |            29 |    1418 |           530 |
| 100times   |   545 |            35 |     632 |           406 |

Almost all reports were false positives:

- **An avoided term that is also a glossary term.** Adamantite avoids "plugin" for **Preset**, and
  defines **Managed plugin**. packref avoids "registry" for **Global store**, and defines
  **Registry**. These made most reports: 423 for "plugin", and 783 for "registry".
- **Property keys and strings.** Keys mirror other APIs, such as Oxlint `jsPlugins` and
  `diagnostics`, and strings are mostly paths, globs, and test titles.
- **A normal word in another sense.** "check", "fix", "dependency", and "action" in Adamantite,
  "fetch" and "install" in packref, and "entry", "mode", "schedule", "attempt" (from `tryharder`),
  and the `react-native` `Alert` in 100times.

The reports that were correct were few, and they were declared names: `findStreaks` and
`STREAK_DAYS` in 100times, which avoids "streak", and `packageKey` in packref, which avoids
"package key".

## Decision

- The rule skips an avoided term that is part of a glossary term, because the glossary itself
  says that the project uses the word in another sense.
- The rule checks only declared names (functions, classes, interfaces, type aliases, enums, and
  variables) and JSX text. It does not check property keys, parameters, destructured names, or
  imports, which mirror other APIs, or other strings, which the rule cannot tell from paths and
  test titles.
- `allow` lists avoided terms that mean something else in the project, such as `mode` in
  100times. It names terms, not files, so one entry covers the whole project.
- The rule is off by default, also in `strict`. A project turns it on when its glossary and its
  code agree well enough that the `allow` list stays short.

The rule reads `GLOSSARY.md` with `node:fs`, which Bun also provides, and the fixture test runs
it under Node.js and under Bun.

## Considered options

- **A `glossary` preset.** A preset that turns on one rule adds a preset to `init` and Doctor, for
  one line in the Oxlint config.
- **Turn the rule on in `strict`.** The spike shows that every project would need an `allow` list
  first.
- **Report user-facing strings.** No AST signal tells a message from a path. JSX text is the one
  kind of string that is always shown to a person.

## Consequences

- Adamantite does not turn the rule on. Its avoided terms are about prose, and its `allow` list
  would hold most of them.
- A rename in the glossary changes the reports in the code after an editor language server
  restart.
