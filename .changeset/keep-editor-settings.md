---
"adamantite": patch
---

Keep the project's editor settings when `init` updates VS Code or Zed

`adamantite init --editor vscode` and `--editor zed` replaced settings that the project had changed, such as `editor.formatOnSave`, `oxc.typeAware`, or Zed's `format_on_save`, with Adamantite's defaults. A second run of `init` reset them again. The update now keeps every value that the project sets, also `null`, and changes only the settings that `adamantite doctor` checks: the Oxlint entry, and the Effect language server settings when the project uses `@effect/tsgo`. In Zed, the project's formatter entries now come before Adamantite's.
