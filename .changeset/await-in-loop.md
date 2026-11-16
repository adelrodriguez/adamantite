---
"adamantite": patch
---

Accept correct code that the core preset reported

The core lint preset changes these rules, so code that has no other correct form passes:

- `no-await-in-loop` is off. The rule told the author to start the calls together, and that is a defect when each call needs the result of the call before it, such as a retry, a lock order, or a page that depends on the page before it.
- `oxc/no-map-spread` is off. The rule reported `{ ...item, done: true }` in a `map` callback and asked for a change in place, so no immutable copy passed core. React state updates use this copy in reducers and event handlers.
- `prefer-object-spread` is off. The rule reported `Object.assign({}, acc, { sum: acc.sum + item.n })` in a `reduce` callback, and its fix wrote a spread that `oxc/no-accumulating-spread` reports. The strict preset still reports an `Object.assign` copy when the accumulator can grow.
- `typescript/non-nullable-type-assertion-style` is off. The rule reported `value as string` and told the author to write `value!`, which `typescript/no-non-null-assertion` bans.
- `no-throw-literal` is off. `typescript/only-throw-error` reports every throw that it reported, such as `throw "failed"`, so one throw got two reports. A suppression now names only `typescript/only-throw-error`.
- `no-redeclare` is off in TypeScript files, so a type and a value can share a name, such as `const Port = Schema.Number` with `type Port = typeof Port.Type`. The type check still reports a value that is declared two times. The setting is in an override of the preset, so change it in an `overrides` entry of your config, because the preset's override takes priority over top-level `rules`.
- `import/unambiguous` is off in `*.d.ts`, `.astro`, `.vue`, and `.svelte` files. A declaration file without an `import` or `export` is a script on purpose, because only a script can declare a wildcard module, such as `declare module "*?raw"`, or a global. The frameworks compile a component's script as a module. The rule still reports `.js` and `.ts` files.
- `jsdoc/check-tag-names` uses `typed: false` in `.js`, `.jsx`, `.mjs`, and `.cjs` files, so a JavaScript file can state types with tags such as `@type`.
- `unicorn/no-useless-undefined` uses `checkArguments: false` and `checkArrowFunctionBody: false`, so it keeps a required argument such as `consume(undefined)` and a concise result such as `() => undefined`. The rule still reports redundant initializers, yields, and empty functions. For a block callback with an explicit `return undefined`, declare a union result type such as `: number | undefined`, because the rule still reports an unannotated return and its fix can conflict with the callback-return checks. With the effect preset, `Effect.succeed(undefined)` still gets the Effect rule that recommends `Effect.undefined`.

Suppressions, overrides, and placeholder exports that you added for these rules are now unneeded, so you can delete them.
