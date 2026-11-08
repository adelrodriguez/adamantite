# Curate the react-doctor rules

The `react-strict` preset loads `oxlint-plugin-react-doctor` as a managed plugin (see
ADR 0003). Version 0.9.18 exports 906 rules. We decided (2026-09-30, issue #470) to enable
a curated list of rules, not all of them. On a small React fixture, all the rules together
reported `preact-no-react-hooks-import` and `react-in-jsx-scope` on plain React files, and
they duplicated native Oxlint rules such as `button-has-type`.

Issue #647 moves the curated rules from the separate `react-doctor` preset into
`react-strict`. The first-party hook restriction and React Doctor misuse checks keep their
own rule namespaces. Doctor reports the retired preset import through its repair prompt.

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
- It does not report valid code. `no-derived-useState` reports every `useState(prop)`,
  including editable state that uses the prop only as its initial value, such as a form
  input. React allows that pattern, so the rule is not in the preset.
- It reports its fixture. `effect-listener-cleanup-mismatch` and
  `no-promise-then-side-effect-in-effect-without-catch` did not report a simple case.
- No other enabled rule reports the same defect. The preset keeps
  `no-direct-state-mutation` and not `no-mutate-then-set-or-return-same-reference`,
  `no-impure-state-updater` and not `no-side-effect-in-state-updater-function`, and
  `no-pass-live-state-to-parent` and not `no-prop-callback-in-effect`.

The 0.9.18 audit confirmed `effect-needs-cleanup` on missing timer and observer
cleanup and mismatched subscription callbacks. It replaces `effect-observer-needs-disconnect`
and covers `effect-listener-cleanup-reference-mismatch`, so neither narrower rule is enabled.
The animation-frame loop fixture still needs `effect-raf-loop-needs-cancel`.

The preset also checks stale timer references, discarded cleanup returns in effect wrappers,
debounced work without cancellation, loading flags left set after a failed request, and
contexts or object URLs created during render.

The `query-*` and `tanstack-start-*` rules are not in this preset. Some still find calls by
name. For example, `query-stable-query-client` reports `new QueryClient()` from a local module,
and `query-mutation-missing-invalidation` reports unrelated local APIs. Other rules now resolve
import bindings. Any future additions belong in `tanstack` and need checks for unrelated imports.

## Consequences

- The preset test keeps the original cases and lints them with `react` and `react-strict`.
  Each case must get its expected React Doctor report and no native or first-party report.
  The test does not cover every rule in the expanded selection.
- Some React Doctor rules skip files by path, such as `__tests__/`, `test/`, `fixtures/`,
  and `*.test.tsx`. The test copies its fixtures to `src/hooks/` before it lints them, where
  the first-party rule permits hooks but React Doctor still checks their use.
- The license is MIT with two added restrictions: no use as machine learning training
  data, and no resale as a hosted product. Adamantite does not copy the source, and the
  target project installs the package from npm.
