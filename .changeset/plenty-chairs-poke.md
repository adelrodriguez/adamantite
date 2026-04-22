---
"adamantite": patch
---

Upgrade the bundled `oxfmt` version to `0.46.0` and enable the new JSDoc formatting option in the Adamantite formatter preset.

Upgrade the bundled `oxlint` version to `1.61.0` and update `oxlint-tsgolint` to `0.21.1` to satisfy oxlint's peer dependency requirement.

The lint presets now remove these rules:

- Core: `comma-dangle`, which is no longer recognized by oxlint
- Vitest: `vitest/prefer-to-be-truthy` and `vitest/prefer-to-be-falsy`, replaced by exact boolean assertions through `vitest/prefer-strict-boolean-matchers`

The lint presets also enable these new rules added in recent oxlint releases:

- Core: `no-useless-assignment`, `object-shorthand`, `unicorn/consistent-template-literal-escape`, `unicorn/custom-error-definition`, `unicorn/no-useless-iterator-to-array`, `unicorn/prefer-import-meta-properties`, and `unicorn/switch-case-break-position`
- React: `react/hook-use-state` and `react/prefer-function-component`
- Jest: `jest/padding-around-after-all-blocks`, `jest/prefer-ending-with-an-expect`, and `jest/valid-expect-in-promise`
- Vitest: `vitest/prefer-called-exactly-once-with`, `vitest/prefer-strict-boolean-matchers`, `vitest/require-awaited-expect-poll`, and `vitest/require-mock-type-parameters`
