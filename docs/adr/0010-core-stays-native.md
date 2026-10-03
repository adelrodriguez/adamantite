# Core absorbs no plugin rules while Oxlint JS plugins are alpha

Issue #407 asked which anti-slop rules and first-party rules the `core` lint preset absorbs
after the opt-in presets have shipped. We decided (2026-10-03, issue #407) that core absorbs
none of them now. Each rule stays in the preset that owns it.

Every rule that #407 named runs through Oxlint `jsPlugins`: the anti-slop rules come from
a vendored bundle, and the `adamantite/*` rules come from the first-party plugin. Oxlint
1.86 documents JS plugins as alpha and not subject to semver. Today core enables only
native Oxlint rules, and so do the framework presets (`react`, `nextjs`, `vue`, `node`). If
core loaded a JS plugin, every target project would depend on an alpha interface, and an
Oxlint minor release could break the lint run of a project that selected no opt-in preset.
An opt-in preset can accept that risk. Core cannot.

## Per-rule decisions

The vendored anti-slop rules have shipped in `antislop` since v0.36.0. Adamantite's own
lint configuration enables all of them, and the source has no suppression for any of them.

| Rule                                                                                                                                                                                                            | Decision                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anti-slop/no-chained-type-assertions`                                                                                                                                                                          | Stays in `antislop`. Close to universal. Revisit when JS plugins are stable.                                                                         |
| `anti-slop/require-safety-comment-for-type-assertion`                                                                                                                                                           | Stays in `antislop`. Close to universal. Revisit when JS plugins are stable.                                                                         |
| `anti-slop/no-reflect-apply`, `anti-slop/no-reflect-get`                                                                                                                                                        | Stay in `antislop`. Revisit when JS plugins are stable.                                                                                              |
| `anti-slop/no-known-value-widening`, `no-widen-then-assert`, `no-unknown-parameters`, `no-unknown-returns`, `no-unknown-type-aliases`, `no-unsafe-dictionary-type`, `no-runtime-typeof`, `no-object-parameters` | Stay in `antislop` permanently. They require one design: decode input at its boundary into types that the code owns. Core does not require a design. |
| `anti-slop/no-shape-in-symbol-names`, `no-conditional-empty-object-spread`                                                                                                                                      | Stay in `antislop` permanently. They are style opinions.                                                                                             |
| `anti-slop/no-module-mocking`                                                                                                                                                                                   | Stays in `antislop` permanently. It requires one test design.                                                                                        |
| `adamantite/no-overzealous-destructuring`                                                                                                                                                                       | Stays in `strict`. It shipped in v0.42.0, and Adamantite does not select `strict`, so there is no use evidence yet.                                  |
| `adamantite/no-react-state-hooks`, `no-query-data-in-state`, `query-from-loader`                                                                                                                                | Stay in `react-strict` and `tanstack`. Framework rules cannot go into core, and the native-only `react` preset has the same JS plugin risk as core.  |

The native `typescript/no-unsafe-type-assertion` rule is not a replacement for the two
assertion rules. It reports 17 assertions in Adamantite's source, and each of them already
has the SAFETY comment that `require-safety-comment-for-type-assertion` requires.

## Consequences

- `no-known-value-widening` stays in `antislop`. So the `antislop` preset continues to turn
  off `typescript/consistent-indexed-object-style` and `unicorn/no-immediate-mutation`,
  which conflict with it.
- This decision changes no preset, so it needs no changeset.
- When Oxlint removes the alpha status from JS plugins, open a new issue to promote the
  rules marked "Revisit". At that time, `no-overzealous-destructuring` has release history
  in `strict` that the new issue can weigh too.
