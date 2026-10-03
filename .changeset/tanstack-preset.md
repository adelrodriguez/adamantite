---
"adamantite": minor
---

Add the `adamantite/lint/tanstack` preset for TanStack Query apps that preload queries in route loaders

The preset enables two rules from Adamantite's own Oxlint plugin. `adamantite/query-from-loader` reports `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, and `useSuspenseInfiniteQuery` from `@tanstack/react-query` in route files, which call a route factory such as `createFileRoute` from `@tanstack/react-router`, when they take a plain options object or a `queryOptions()` call made inside a function, including through a local `const`. Define each query once with `queryOptions()` (`infiniteQueryOptions()` for the infinite hooks) at module scope or in an exported factory, preload it in the route loader, and pass the same options to the hook. Type-only wrappers, such as `as const` and `satisfies`, do not hide the options from the rule. An object that spreads shared options, such as `{ ...userQuery(id), select }`, stays allowed. The rule checks one file at a time, so it cannot prove that a loader preloads the options. `adamantite/no-query-data-in-state` reports `useState` calls whose initial value comes from query data, such as `useState(query.data)`, because the copy stops updating when the query refetches.

Select the preset in `adamantite init` or with `--preset tanstack`. It needs no extra dependency.
