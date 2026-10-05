---
"adamantite": patch
---

Turn off four rules in the `vitest` lint preset and one in the `jest` lint preset that contradict another rule in the same preset. Before, code that one rule required was reported by the other rule.

- `vitest`: keep `prefer-importing-vitest-globals` and turn off `no-importing-vitest-globals`.
- `vitest`: keep `prefer-called-once` and turn off `prefer-called-times`.
- `vitest`: keep `valid-title` and turn off `prefer-describe-function-title`.
- `vitest` and `jest`: keep `require-hook` and turn off `no-hooks`. Setup code can now go in `beforeAll` and `beforeEach`, and `prefer-hooks-on-top`, `prefer-hooks-in-order`, and `no-duplicate-hooks` now apply.
