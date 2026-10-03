# Define TanStack queries once so route loaders can preload them

Agents often call `useQuery({ queryKey, queryFn })` with an inline object in a component. A
route loader cannot preload that query, so the route renders, then fetches, and a route
with `preload="intent"` still shows a loading state. We decided (2026-10-03, issue #406)
that a new `tanstack` preset enables two first-party rules at `"error"`.

`adamantite/query-from-loader` reports `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`,
and `useSuspenseInfiniteQuery` from `@tanstack/react-query` in route files when the options
argument is:

- A plain object literal. An object that spreads other options, such as
  `{ ...userQuery(id), select }`, stays allowed, because it extends a shared definition.
- A `queryOptions()` or `infiniteQueryOptions()` call inside a function. Each render then
  makes new options that no loader can import.
- A `const` that resolves to one of the two cases above. A plain object at module scope is
  also reported: `queryOptions()` gives the query key and data types that the loader and
  the hook share.

A route file is a file that calls a route factory from `@tanstack/react-router`:
`createFileRoute`, `createLazyFileRoute`, `createRootRoute`, `createRootRouteWithContext`,
`createRoute`, or `createLazyRoute`. Only a route has a loader that can preload a query. A
component outside a route file, such as a search box that queries on user input, can keep
inline options. The rule detects routes by the import, not by a `routes/` path, so it works
with a custom `routesDirectory` and with code-based routing, and it skips files in a route
directory that define no route.

The rule looks through type-only wrappers, such as `as const` and `satisfies`. Each
message names the matching factory and preload method: `queryOptions()` and
`ensureQueryData()` for the regular hooks, and `infiniteQueryOptions()` and
`ensureInfiniteQueryData()` for the infinite hooks.

Other arguments are allowed: imports, parameters, member expressions, and calls such as
`userQuery(id)`. The rule checks one file at a time, so it cannot prove that a loader
preloads the options. It moves queries toward shared definitions, and the loader stays a
review concern.

`adamantite/no-query-data-in-state` reports `useState` from `react` when the initial value
comes from the data of a query in the same file: `query.data`, a destructured `data`
binding, a member of either, a `??` or `||` operand, or the expression body of an
initializer function. The copy stops updating when the query refetches or another
component changes the cache.

Neither rule overlaps the `react-doctor` preset. We ran every rule of
`oxlint-plugin-react-doctor` 0.9.14 on this preset's fixtures. No rule reported an inline
`useQuery` options object or a `useState` call initialized from query data.
`react-doctor/no-derived-useState` reports state derived from props. The `query-*` and `tanstack-start-*` rules that React Doctor has
stay out of this preset.

The rules support only `@tanstack/react-query`. The Solid, Vue, Svelte, and Angular
adapters take options in other shapes, such as a getter function, and Adamantite has no
preset for those frameworks.

In feature code, `react-strict` also reports the `useState` call that
`no-query-data-in-state` reports. The two messages give different instructions, and
`no-query-data-in-state` still applies in hook modules, where `react-strict` allows hooks.

## Consequences

- A project that selects `tanstack` moves each query into a `queryOptions()` definition
  that its route loader can import. A query without a loader, such as one that depends on
  user input, still uses a module-scope definition or a factory.
- A change to the reported hooks or argument shapes, or a downgrade from `"error"`, is a
  preset behavior change that ships to consumers and requires a changeset.
