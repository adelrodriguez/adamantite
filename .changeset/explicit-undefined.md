---
"adamantite": patch
---

Preserve required `undefined` arguments and concise arrow results in the core preset

The core preset enables `unicorn/no-useless-undefined` with `checkArguments: false` and `checkArrowFunctionBody: false`. It keeps required arguments such as `consume(undefined)` and concise results such as `() => undefined`. The empty-function and callback-return checks stay enabled. With the effect preset, `Effect.succeed(undefined)` still gets the Effect rule that recommends `Effect.undefined`.

For an optional callback result, use an expression such as `(flag) => flag ? 1 : undefined`. For a block callback with an explicit `return undefined`, declare a union result type such as `: number | undefined`. An unannotated return is still reported, and its fix can conflict with the callback-return or redundant-return checks. Change that callback before applying fixes. A `: undefined` annotation alone does not preserve a block return. The rule still reports redundant initializers and yields.
