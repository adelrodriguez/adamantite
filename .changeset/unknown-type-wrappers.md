---
"adamantite": minor
---

Find `unknown` behind aliases and wrappers, and allow it for parsers and error causes, in the strict preset

`quality/no-unknown-parameters`, `quality/no-unknown-returns`, and `quality/no-unknown-type-aliases` now share one check for `unknown`:

- All three rules resolve local type aliases, as in `type Box<T> = T` with `Box<unknown>`, and see through `Awaited<unknown>` and `NoInfer<unknown>`. A local declaration with the same name as a built-in type, such as `interface Promise<T>`, is not treated as the built-in type.
- `quality/no-unknown-returns` also reports `globalThis.Promise<unknown>`, `Iterable<unknown>`, `AsyncIterable<unknown>`, `AsyncIterator<unknown>`, `Generator<unknown>`, and `AsyncGenerator<unknown>`.
- `quality/no-known-value-widening` uses the same check for the parameter of a type guard.
- Each alias body sees only its own type parameters. Before, in `type Reply<Payload> = Envelope | Payload[]`, the rules read an imported `Payload` inside `Envelope` as the `unknown` argument of `Reply<unknown>`. A type argument that names a type parameter of an outer alias, such as `Index<T | Command>`, resolves against that outer alias, so `quality/no-unsafe-dictionary-type` reports it when the outer argument is `unknown`.

`quality/no-unknown-parameters` allows an `unknown` parameter in two more cases, and one fewer:

- A function that only passes the parameter to a schema parser, such as `schema.parse(value)`, `z.safeParse(schema, value)`, or `Schema.decodeUnknownSync(User)(value)`, or checks it with `instanceof`, passes. A function that reads the value without parsing it, or that also passes the raw value somewhere else, is still reported.
- A parameter named `cause` passes only on a constructor, as in `constructor(message: string, cause: unknown)`, and on a function, method, class, or interface whose name ends in `Error` or has the word `cause`, as in `toError`, `AppError`, or `formatCauseDetail`. Before, every `unknown` parameter named `cause` passed, so `function parse(cause: unknown)` did. A `cause` property in an object type, as in `options: { cause: unknown }`, still passes.
