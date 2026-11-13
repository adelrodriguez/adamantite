# Adamantite owns the anti-slop rules

The `strict` preset loaded a vendored bundle of anti-slop, and Adamantite fixed each upstream
defect with a patch that `scripts/vendor-plugins.ts` applied before the build. Issue #742 showed
that the patch path does not scale. A review of the 18 rules that `strict` enables found 14
defects that report correct code or make fix and check disagree, and more than ten easy bypasses.
Each fix would need its own patch against code that Adamantite could not lint or test directly. We decided (2026-11-13,
issue #742) that the rules become first-party code in `presets/lint/plugin/antislop/`, copied from
upstream commit `13909c9`, and that they keep the `anti-slop` namespace.

## How the rules live in the repository

`presets/lint/plugin/antislop/index.ts` registers the rules under the plugin name `anti-slop`, and
`strict` loads it with a file URL, as it loads the `adamantite` plugin. Each rule uses the
first-party form, `const rule: Rule = { ... }`, and imports only types from `@oxlint/plugins`. The
upstream RuleTester tests moved to `src/__tests__/plugin/antislop/`, and the strict preset
fixtures did not change. `scripts/copy-anti-slop-rules.ts` made the copy. A run of the script at
the commit that adds it writes the same files.

The rules started as MIT-licensed code, so `license.md` keeps the anti-slop notice, and
`stylistic/license.md` keeps the ESLint Stylistic notice. The build copies both notices.

## Considered options

- **Keep the vendored bundle and add patches.** Each fix needs a patch that must still apply at
  the next pinned commit, and the repository's own lint and type checks do not run on the patched
  code.
- **Move the rules to the `adamantite` namespace.** One namespace is simpler, but every
  `anti-slop/*` setting and suppression comment in target projects would break, and Doctor would
  have to rewrite them.

## Consequences

- Target projects keep their `anti-slop/*` settings and suppressions. The rules behave as the
  patched bundle did.
- Adamantite fixes a rule defect with a failing test and a change to the rule, as for a
  first-party rule. Upstream fixes no longer arrive through a version bump, so a maintainer ports
  a relevant upstream fix by hand.
- The `effect` preset's `anti-slop-effect` rules moved the same way, to
  `presets/lint/plugin/antislop-effect/`, with `scripts/copy-anti-slop-effect-rules.ts`. They keep
  the `anti-slop-effect` namespace, and the effect preset fixtures did not change. No vendored
  bundle remains, so `scripts/vendor-plugins.ts` and its patches are gone.
- This record replaces the vendored-bundle decision in ADR 0025 for the `strict` preset, and in
  ADR 0007 for the `effect` preset. The rule scope in those records does not change.
