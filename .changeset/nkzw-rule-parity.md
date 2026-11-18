---
"adamantite": minor
---

Turn on `curly` and `import/export` in the core preset, and add `adamantite/require-effect-dependencies` to the react-strict preset

These rules report code that passed before, so `adamantite check` can fail after you update.

- `curly` reports an `if`, `else`, or loop body without braces, such as `if (done) return`. `adamantite fix` adds the braces. With the strict preset, run `adamantite fix` a second time, because the spacing rule then asks for a blank line after the new block, and Oxlint applies one pass of fixes.
- `import/export` reports a name that a module exports twice, including a local export that hides a name of an `export *`. TypeScript does not report that case, and it does not check JavaScript files. Rename or remove one of the exports.
- `adamantite/require-effect-dependencies` reports a call to `useEffect`, `useLayoutEffect`, or `useInsertionEffect` that passes no dependency array, because React then runs the effect after every render. Pass the values that the effect reads, or `[]` to run it once after the first render.
