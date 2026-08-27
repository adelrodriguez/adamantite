# Keep unicorn/no-array-callback-reference in the core lint preset

The `unicorn/no-array-callback-reference` rule matches on method names (`.some`, `.map`,
`.filter`, `.forEach`) without type information, so it reports false positives on Effect
combinators such as `Option.some(reference)` and `Effect.forEach(data, fn)`. We decided
(2026-08-13, PR #365) to keep the rule at `"error"` in `presets/lint/core.ts`. The bugs it
catches — iterator methods that silently pass `(element, index, array)` into a function
reference, as in `array.map(parseInt)` — are worth the workaround cost.

## Consequences

- Code in this repository, and in target projects that use Effect or similar functional
  libraries, must satisfy the rule with `pipe(x, Option.some)` in place of
  `Option.some(reference)`, and the curried data-last `Effect.forEach(fn)` inside
  `pipe(...)` in place of `Effect.forEach(data, fn)`. See `src/lib/integrations/assessment.ts`
  for the precedent.
- Removal or downgrade of the rule is a preset behavior change that ships to consumers
  and requires a changeset.
