---
"adamantite": patch
---

Stop asking for `useMemo` on an inline context value in the react preset

The react lint preset no longer turns on `react/jsx-no-constructed-context-values`. The rule reported `<ThemeContext.Provider value={{ mode }}>` and asked for `useMemo`, but the react-strict preset bans `useMemo` in feature code because the React Compiler memoizes. So a project with both presets got two reports that it could not satisfy together. The react preset already left out the similar `react-perf` rules for new objects, arrays, and functions in props. A project without the React Compiler can turn the rule on in its own `oxlint.config.ts`.
