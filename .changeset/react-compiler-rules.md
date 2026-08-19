---
"adamantite": minor
---

Adopt the React Compiler rules that replace `react/react-compiler` in oxlint 1.79.0

oxlint 1.79.0 removed the nursery `react/react-compiler` rule and split it into per-category React Compiler rules. The react preset now enables the correctness rules (`error-boundaries`, `globals`, `immutability`, `incompatible-library`, `preserve-manual-memoization`, `purity`, `refs`, `set-state-in-effect`, `set-state-in-render`, `static-components`, `use-memo`, `void-use-memo`), the suspicious rules (`capitalized-calls`, `hooks`, `memo-dependencies`), and the perf rule `no-deriving-state-in-effects` as errors. `exhaustive-effect-dependencies` stays off because it duplicates the diagnostics `react/exhaustive-deps` already reports, and the restriction-category rules (`invariant`, `rule-suppression`, `syntax`, `todo`, `unsupported-syntax`) stay off because they only apply to codebases running the React Compiler build.

**Breaking behavior:** oxlint 1.79.0 fails to load any config that still references the removed rule — linting stays completely down until the reference is gone. Projects that only extend the Adamantite presets are covered by this release, but if your own `oxlint.config.ts` overrides `react/react-compiler` (for example to turn it off), delete that entry when you update. Managed projects install oxlint 1.79.0 on the next `adamantite update`.
