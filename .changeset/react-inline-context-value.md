---
"adamantite": patch
---

Make the React and Next.js presets agree with core and react-strict

- The react lint preset no longer turns on `react/jsx-no-constructed-context-values`. The rule reported `<ThemeContext.Provider value={{ mode }}>` and asked for `useMemo`, but react-strict bans `useMemo` in feature code because the React Compiler memoizes. The react preset already left out the similar `react-perf` rules. A project without the React Compiler can turn the rule on in its own `oxlint.config.ts`.
- The nextjs lint preset now turns off `typescript/require-await`. Next.js rejects each exported function of a `"use server"` file that is not async, so the rule reported a server action that the user could not change. An Oxlint override cannot select a file by its `"use server"` directive, so the rule is off in all files.
- The default `allow` list of `adamantite/no-react-state-hooks` now includes `**/hooks.{ts,tsx}`, for a feature that keeps its hooks in one file, such as `features/cart/hooks.ts`. It no longer includes `**/use[A-Z]*.{ts,tsx}`, because core's `unicorn/filename-case` asks for `use-counter.ts` instead of `useCounter.ts`. Rename such a hook module, or move it under a `hooks` directory. A project that keeps camelCase file names can add `"**/use[A-Z]*.{ts,tsx}"` to the rule's `allow` option, and an `allow` option that only repeated the defaults to add the `hooks.ts` glob can go.
