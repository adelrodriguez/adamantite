# Limit destructuring depth and width in a framework-neutral strict preset

Agents often destructure deeply nested values or many properties in one pattern, such as
`const { data: { user: { profile } } } = query`. The pattern hides where each value comes
from, crashes when an intermediate value is missing, and makes a later change touch the
whole pattern. We decided (2026-09-29, issue #408) that a new `strict` preset enables
`adamantite/no-overzealous-destructuring` at `"error"`.

The issue first planned the rule for `react-strict`. The rule does not look at React code: a
nested pattern is as hard to read in a Node.js service as in a component. So it goes in a
framework-neutral `strict` preset that a project selects with any other preset. The type
assertion ban (`typescript/consistent-type-assertions`) moves from `react-strict` to
`strict` for the same reason. Neither preset had shipped yet, so the move breaks no
consumer. `react-strict` keeps only React opinions. The `strict` preset is also where
framework-neutral first-party rules prove themselves before #407 decides what core absorbs.

The rule counts two things for each destructuring pattern:

- Depth: an object or array pattern is one level. Each pattern nested inside it, through a
  property, a default value, or a rest element, adds one level. The default `maxDepth` is 2,
  so `const { data: { user } } = query` stays allowed. The rule reports only the first
  pattern past the limit, so one nested branch gives one report.
- Width: the properties of one object pattern. A rest element does not count, and array
  patterns do not count, because tuple results such as `[value, setValue]` name positions.
  The default `maxProperties` is 5, which covers typical component props such as
  `{ children, className, size, variant, type, ...props }`.

The rule applies to every destructuring pattern: declarations, parameters, assignments,
`for...of` heads, and `catch` clauses. It has no `allow` globs: a pattern is not more
readable in one directory than in another.

No managed plugin reports this. React Doctor only reports destructuring of query results and
zustand stores, not pattern depth or width.

## Consequences

- A project that selects `strict` keeps the source object and reads its members, or
  splits a pattern into separate declarations. A project with other limits sets the rule's
  `maxDepth` and `maxProperties` options.
- A change to the default limits, a change to what counts toward them, or a downgrade from
  `"error"` is a preset behavior change that ships to consumers and requires a changeset.
