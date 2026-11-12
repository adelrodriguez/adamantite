/// <reference path="helpers.d.ts" />

// NoInfer<S> prevents contextual typing from flowing backward through S when
// .filter(Boolean) is used inline as a function argument, which would silently
// skip structural checks on array elements. See total-typescript/ts-reset#233.
//
// The <S extends T> generic is not needed for inference (NoInfer kills that) —
// it exists solely to keep TypeScript's overload resolution correct so that
// non-Boolean predicates on union arrays (e.g. string[] | number[]) fall
// through to the built-in filter signature instead of matching this overload.

interface Array<T> {
  filter<S extends T>(
    predicate: BooleanConstructor,
    thisArg?: unknown
  ): Array<AdamantiteTypeScript.NonFalsy<NoInfer<S>>>
}

interface ReadonlyArray<T> {
  filter<S extends T>(
    predicate: BooleanConstructor,
    thisArg?: unknown
  ): Array<AdamantiteTypeScript.NonFalsy<NoInfer<S>>>
}
