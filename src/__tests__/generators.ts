import * as Array_ from "effect/Array"
import * as Schema from "effect/Schema"
import * as Arbitrary from "effect/unstable/arbitrary/Arbitrary"

export function choose<const A>(...values: A[]): Arbitrary.Arbitrary<A> {
  if (values.length === 0) throw new Error("At least one choice is required")
  return Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ maximum: values.length - 1, minimum: 0 }))
  ).pipe(Arbitrary.map((index) => Array_.getUnsafe(values, index)))
}

export function oneOf<A extends readonly unknown[]>(
  ...values: { readonly [K in keyof A]: Arbitrary.Arbitrary<A[K]> }
): Arbitrary.Arbitrary<A[number]> {
  return choose(...values).pipe(Arbitrary.flatMap((value) => value))
}

export function nullable<A>(value: Arbitrary.Arbitrary<A>): Arbitrary.Arbitrary<A | null> {
  return Arbitrary.schema(Schema.Boolean).pipe(
    Arbitrary.flatMap((present) => (present ? value : Arbitrary.Constant(null)))
  )
}

export function array<A>(
  value: Arbitrary.Arbitrary<A>,
  options: { readonly maxLength: number }
): Arbitrary.Arbitrary<A[]> {
  return Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ maximum: options.maxLength, minimum: 0 }))
  ).pipe(Arbitrary.flatMap((length) => Arbitrary.all(Array.from({ length }, () => value))))
}

export function subset<A>(values: readonly A[]): Arbitrary.Arbitrary<A[]> {
  return Arbitrary.all(values.map(() => Arbitrary.schema(Schema.Boolean))).pipe(
    Arbitrary.map((included) => values.filter((_, index) => included[index]))
  )
}

export function dictionary<A>(
  key: Arbitrary.Arbitrary<string>,
  value: Arbitrary.Arbitrary<A>,
  options?: { readonly maxKeys: number }
): Arbitrary.Arbitrary<Record<string, A>> {
  return array(Arbitrary.all([key, value]), { maxLength: options?.maxKeys ?? 10 }).pipe(
    Arbitrary.map((entries) => Object.fromEntries(entries))
  )
}

function jsonSchema(depth: number): Schema.Codec<Schema.MutableJson> {
  const primitive = Schema.Union([Schema.Null, Schema.Boolean, Schema.Finite, Schema.String])
  if (depth === 0) return primitive
  const child = jsonSchema(depth - 1)
  return Schema.Union([
    primitive,
    Schema.mutable(Schema.Array(child)),
    Schema.Record(Schema.String, child),
  ])
}

export function jsonValue(options: {
  readonly maxDepth: number
}): Arbitrary.Arbitrary<Schema.MutableJson> {
  return Arbitrary.schema(jsonSchema(options.maxDepth))
}
