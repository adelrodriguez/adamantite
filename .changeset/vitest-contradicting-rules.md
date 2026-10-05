---
"adamantite": patch
---

Turn off three rules in the `vitest` lint preset that contradict another rule in the preset. Before, no test code could pass both rules of each pair. The preset now keeps `vitest/prefer-importing-vitest-globals` and turns off `vitest/no-importing-vitest-globals`, keeps `vitest/prefer-called-once` and turns off `vitest/prefer-called-times`, and keeps `vitest/valid-title` and turns off `vitest/prefer-describe-function-title`.
