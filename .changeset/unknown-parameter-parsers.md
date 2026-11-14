---
"adamantite": patch
---

Let a parser function take an `unknown` parameter in the strict preset

`antislop/no-unknown-parameters` no longer reports an `unknown` parameter when the function only passes it to a schema parser, such as `schema.parse(value)`, `z.safeParse(schema, value)`, or `Schema.decodeUnknownSync(User)(value)`, or checks it with `instanceof`. A function that reads the value without parsing it, or that also passes the raw value somewhere else, is still reported.
