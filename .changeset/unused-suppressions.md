---
"adamantite": minor
---

Report an unused `oxlint-disable` comment in `adamantite check`, and remove it in `adamantite fix`

The core preset sets `options.reportUnusedDisableDirectives` to `"error"`. `adamantite check` now fails on an `oxlint-disable` comment that suppresses nothing, and `adamantite fix` removes the comment with Oxlint 1.93 or later. With Oxlint 1.92, remove the comment yourself. When `fix` removes a comment that has no reason, the same run still reports `adamantite/require-suppression-reason` for the comment, and the next `check` passes.

Zed and VS Code now report these comments with the severity from the Oxlint config. The Zed settings that Adamantite writes no longer set `unusedDisableDirectives`. If you changed `.zed/settings.json`, remove `lsp.oxlint.initialization_options.settings.unusedDisableDirectives` so that Zed follows your Oxlint config.

To turn the report off, set `options.reportUnusedDisableDirectives` to `"off"` in the root `oxlint.config.ts`. Oxlint reads this option only from the root config.
