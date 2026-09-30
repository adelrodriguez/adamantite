# Curate the react-doctor rules

The `react-doctor` preset loads `oxlint-plugin-react-doctor` as a managed plugin (see
ADR 0003). Version 0.9.14 exports 906 rules. We decided (2026-09-30, issue #470) to enable
a curated list of rules, not all of them. On a small React fixture, all the rules together
reported `preact-no-react-hooks-import` and `react-in-jsx-scope` on plain React files, and
they duplicated native Oxlint rules such as `button-has-type`.

A rule is in the preset only when all of these conditions are true:

- It reports misuse of React state or effects. It does not ban a hook: that is the job of
  `adamantite/no-react-state-hooks` in the `react-strict` preset (ADR 0004).
- It runs on one file. Project-graph rules, `deslop/*`, `socket/*`, and the security-scan
  rules do nothing outside the React Doctor CLI.
- Its `recommendation` does not start with "Retired".
- It does not target a framework that the preset does not target, such as Preact, Ink,
  React Three Fiber, React Native, or Expo.
- On its fixture, the native `react`, `react-hooks`, `jsx-a11y`, and `unicorn` rules that
  Adamantite enables report nothing. This excludes, for example:
  - `no-derived-state-effect`, `no-mirror-prop-effect`, and `no-self-updating-effect`,
    which `react/no-deriving-state-in-effects` reports.
  - `no-adjust-state-on-prop-change`, `no-reset-all-state-on-prop-change`,
    `no-chain-state-updates`, and `no-initialize-state`, which report the same effect as
    `react/set-state-in-effect`.
  - `no-effect-with-fresh-deps`, `no-effect-event-in-deps`, and
    `no-async-effect-callback`, which `react-hooks/exhaustive-deps` reports.
  - `effect-remove-listener-inline-handler`, which
    `unicorn/no-invalid-remove-event-listener` reports.
- It reports its fixture. `effect-needs-cleanup`, `effect-listener-cleanup-mismatch`, and
  `no-promise-then-side-effect-in-effect-without-catch` did not report a simple case.
- No other enabled rule reports the same defect. The preset keeps
  `no-direct-state-mutation` and not `no-mutate-then-set-or-return-same-reference`,
  `no-impure-state-updater` and not `no-side-effect-in-state-updater-function`, and
  `no-pass-live-state-to-parent` and not `no-prop-callback-in-effect`.

The `query-*` and `tanstack-start-*` rules are not in this preset. They find calls by name,
so they report a project that does not depend on TanStack Query or TanStack Start. For
example, `query-stable-query-client` reports `new QueryClient()` from a local module. They
belong in the `tanstack` preset (#406).

## Consequences

- The preset test lints one fixture for each enabled rule, with the `react` preset. It
  fails when a rule stops reporting its fixture, or when a native rule reports the same
  fixture. The package is 0.x and renames rules, so the test also asserts that every
  enabled rule id is in the plugin's `rules`.
- Some React Doctor rules skip files by path, such as `__tests__/`, `test/`, `fixtures/`,
  and `*.test.tsx`. The test copies its fixtures to `src/` before it lints them.
- A new rule is added only with a fixture that meets these conditions.
- The license is MIT with two added restrictions: no use as machine learning training
  data, and no resale as a hosted product. Adamantite does not copy the source, and the
  target project installs the package from npm.
