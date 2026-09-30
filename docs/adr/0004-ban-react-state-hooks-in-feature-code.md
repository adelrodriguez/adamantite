# Ban React state, effect, and memoization hooks in feature code

The `react-strict` preset takes a position on where React state and side effects belong. We
decided (2026-09-29, issue #405) that `adamantite/no-react-state-hooks` reports `useState`,
`useReducer`, `useEffect`, `useLayoutEffect`, `useSyncExternalStore`, `useMemo`, and
`useCallback` in feature code at `"error"`. State comes from loaders, URL params, and
queries. Side effects live in loaders, actions, and event handlers. The React Compiler
memoizes. Hook modules (`**/use[A-Z]*.{ts,tsx}`,
`**/use-*.{ts,tsx}`, and `**/hooks/**` by default) keep the hooks for
the few cases that need them.

The ban was first planned as `no-restricted-imports` config (#404). A first-party rule is
the better shape:

- It also reports `React.useState(...)` through a default or namespace import, which an
  import ban does not see.
- It gives one message for each hook group that tells an agent what to do instead.
- Its `allow` option marks hook modules with globs, without an override block for each
  directory. Later first-party rules can use the same feature-code convention.

The `react-doctor` preset (#470) does not replace this rule. React Doctor rules report
specific misuse, such as state derived from props or data fetching in an effect. They do
not ban a hook, and they do not report manual memoization.

## Consequences

- A project that selects `react-strict` moves local state and effects into hook modules or
  out of components. A project with another layout sets the rule's `allow` option.
- Removal of the rule, a change to the default hooks or `allow` globs, or a downgrade from
  `"error"` is a preset behavior change that ships to consumers and requires a changeset.
