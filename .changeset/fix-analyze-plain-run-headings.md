---
"adamantite": patch
---

Print the stage headings of `adamantite fix` and `adamantite analyze` only on a plain run, as `adamantite check` does

`adamantite fix`, `adamantite fix <files>`, and `adamantite analyze` still print a heading above each stage. With `--only` or arguments after `--`, they print only the tool's output, such as a Knip reporter that a script parses. In a coding agent's shell, where Oxlint prints its agent report, they print no heading either, so an agent reads the same kind of output from `check`, `fix`, and `analyze`.
