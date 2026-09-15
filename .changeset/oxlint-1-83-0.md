---
"adamantite": patch
---

Update the managed `oxlint` version to 1.83.0. Managed projects pick the new version up on `adamantite update`. No preset rules were removed or renamed in 1.80.0-1.83.0, so no config change is necessary. Notable upstream changes: React 19.3 support in `react/jsx-no-useless-fragment` (new `ref` prop exempted) and `react/no-unknown-property` (new DOM properties), a `checkConditionalExpressions` option for `eslint/no-unmodified-loop-condition`, and suggestions for `typescript/no-confusing-non-null-assertion` and `nextjs/no-typos`.
