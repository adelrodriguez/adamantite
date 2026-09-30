---
"adamantite": minor
---

Add the `adamantite/lint/react-strict` preset for React feature code

The preset enables `adamantite/no-react-state-hooks`, the first rule of Adamantite's own Oxlint plugin. The rule reports `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useSyncExternalStore`, `useMemo`, and `useCallback` from `react`, including aliased imports and `React.useState(...)` calls. Each message tells what to do instead. Hooks stay allowed in hook modules that match `**/use[A-Z]*.{ts,tsx}`, `**/use-*.{ts,tsx}`, or `**/hooks/**`, such as `useCart.ts` and `use-cart.ts`. Set the rule's `allow` option for another layout, and its `hooks` option to change the reported hooks.

The preset also sets `typescript/consistent-type-assertions` to ban type assertions. `as const` stays allowed, and test files keep the core preset's setting.

Select the preset in `adamantite init` or with `--preset react-strict`. The plugin ships inside the package, so the preset needs no extra dependency.
