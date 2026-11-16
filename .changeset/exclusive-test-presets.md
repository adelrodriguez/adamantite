---
"adamantite": patch
---

Accept correct test code in the jest and vitest presets, and allow only one of the two

- `consistent-test-it` is off for a time. Its fix renamed a `test` call in `describe` to `it`, but did not change the import, so the file failed at run time unless Vitest ran with `globals: true`. The presets will turn the rule on again when an Oxlint release keeps the import ([oxc-project/oxc#29181](https://github.com/oxc-project/oxc/issues/29181)).
- `prefer-lowercase-title` has `ignore: ["describe"]`, so `describe("Calculator", ...)` passes, because a describe title often names the class or function under test. The rule still reports a test title that starts with a capital letter.
- `require-hook` accepts a top-level `tester.run(...)` call, and `vitest/require-hook` also accepts a `layer(TestLayer)("name", (it) => ...)` suite of `@effect/vitest`. The rule matches the name of the call, not the import, so a top-level call of another function named `layer` also passes. The RuleTester test that `adamantite rule test add` writes no longer has a suppression for `require-hook`, and `adamantite fix` removes that suppression from a test that it wrote before.
- `vitest/prefer-import-in-mock` and `jest/no-untyped-mock-factory` are off. They told the author how to write a module mock, but the strict preset's `antislop/no-module-mocking` bans each module mock, so the code that obeyed the first report still failed. A project without the strict preset can turn the rules on in its own `oxlint.config.ts`.

The two presets report the same test defects, so a config that extended both gave two reports for each defect. `adamantite init` now rejects `--preset jest --preset vitest`, and the interactive prompt asks which of the two presets to keep. `adamantite doctor` reports a config that extends both presets. A config that uses each preset in an override of its own is not reported.

Suppressions that name the rules that are now off are unused, so you can delete them.
