---
"adamantite": patch
---

Accept one of the jest and vitest presets, not both

The jest and vitest presets report the same test defects, so a config that extended both gave two reports for each defect, such as `jest(no-disabled-tests)` and `vitest(no-disabled-tests)` on one skipped test. `adamantite init` now rejects `--preset jest --preset vitest`, and the interactive prompt asks which of the two presets to keep. `adamantite doctor` reports a config that extends both presets. A config that uses each preset in an override of its own is not reported.
