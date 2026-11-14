---
"adamantite": patch
---

Stop reporting an imported type that shares its name with a type parameter

`antislop/no-unknown-type-aliases`, `antislop/no-unknown-returns`, `antislop/no-unsafe-dictionary-type`, and `antislop/no-known-value-widening` resolve type aliases to find hidden `unknown` and open dictionaries. They gave the type parameters of one alias to every alias it refers to. So in `type Reply<Payload> = Envelope | Payload[]`, the rules read an imported `Payload` inside `Envelope` as the `unknown` argument of `Reply<unknown>`. Each alias body now sees only its own type parameters. A type argument that names a type parameter of an outer alias, such as `Index<T | Command>`, now resolves against that outer alias, so `no-unsafe-dictionary-type` reports it when the outer argument is `unknown`.
