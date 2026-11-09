# The strict preset absorbs the anti-slop rules

The `antislop` and `strict` presets enforced one design: types come from decoding and narrowing,
not from assertions or `unknown`. Users had to find and select two presets, and the presets
reported the same defect more than once. Outside tests, `input as unknown as string` got five
reports: two from `typescript/consistent-type-assertions` in `strict`, one from
`anti-slop/no-chained-type-assertions`, and two from
`anti-slop/require-safety-comment-for-type-assertion`. We decided (2026-11-08) that `strict`
loads the vendored anti-slop bundle and enables its rules, and that `adamantite/lint/antislop`
is retired.

## Rule scope

- Outside tests, `strict` bans type assertions with `typescript/consistent-type-assertions`, so
  that rule is the only one that reports an assertion there. A deliberate assertion outside tests
  needs a suppression, and `adamantite/require-suppression-reason` requires its reason.
- In test files, `strict` allows type assertions. There,
  `anti-slop/require-safety-comment-for-type-assertion`, `anti-slop/no-chained-type-assertions`,
  and `anti-slop/no-widen-then-assert` apply, so each assertion states its reason and no chain
  hides the source type. Test files are the files that `strict` already treats as tests:
  `*.test.*`, `*.spec.*`, and `__tests__/`.
- Every other anti-slop rule applies to all files.
- `strict` turns off the core rules `typescript/consistent-indexed-object-style` and
  `unicorn/no-immediate-mutation`, which conflict with `anti-slop/no-known-value-widening`.

## Considered options

- **Enable every anti-slop rule in all files.** It is simpler, but outside tests one assertion
  gets several reports for one defect.
- **Keep `antislop` as a preset that `strict` requires.** Two public presets would still hold one
  design, and users would still have to learn both.

## Consequences

- A project that selected `strict` without `antislop` gets the anti-slop rules. Adamantite is
  below 1.0, so this is a minor version.
- Doctor reports an import of `adamantite/lint/antislop` with the `strict-preset-migration`
  finding. `init` no longer offers `antislop`.
- The rule namespace stays `anti-slop`, so project overrides of `anti-slop/*` rules keep working.
- A test asserts that `strict` enables each rule of the bundle exactly once, either for all files
  or for test files.
