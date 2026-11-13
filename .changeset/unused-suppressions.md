---
"adamantite": minor
---

Report an unused `oxlint-disable` comment in `adamantite check`, and remove it in `adamantite fix`

The core preset sets `options.reportUnusedDisableDirectives` to `"error"`. `adamantite check` now fails on an `oxlint-disable` comment that suppresses nothing, and `adamantite fix` removes the comment with Oxlint 1.93 or later. With Oxlint 1.92, remove the comment yourself.

Zed reported these comments before, but `check` and CI accepted them. Zed and VS Code now report them with the severity from the Oxlint config. New Zed settings no longer set `unusedDisableDirectives`. Existing settings keep it, so remove `lsp.oxlint.initialization_options.settings.unusedDisableDirectives` from `.zed/settings.json` if you want Zed to follow your Oxlint config.

To turn the report off, set `options.reportUnusedDisableDirectives` to `"off"` in the root `oxlint.config.ts`. Oxlint reads this option only from the root config.

The jest and vitest presets now accept a top-level `tester.run(...)` call in `require-hook`, and the RuleTester test that `adamantite rule test add` writes no longer has a suppression for `vitest/require-hook` and `jest/require-hook`. In a project without a test preset, that suppression suppressed nothing. `check` reports the suppression in a test that `rule test add` wrote before, and `fix` removes it.

When `fix` removes a comment that has no reason, the same run still reports `adamantite/require-suppression-reason` for the comment. The next `check` passes.
