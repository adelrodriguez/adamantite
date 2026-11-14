---
"adamantite": patch
---

Stop `adamantite fix` from breaking a test file that imports `test`

The jest and vitest lint presets now turn off `consistent-test-it` for a time. The fix of the rule renamed a `test` call in `describe` to `it`, but it did not change the import. The file then called an `it` that it did not import, and it failed at run time unless Vitest ran with `globals: true`. The presets will turn the rule on again when an Oxlint release keeps the import ([oxc-project/oxc#29181](https://github.com/oxc-project/oxc/issues/29181)). Suppressions that name `consistent-test-it` are now unused, so you can delete them.
