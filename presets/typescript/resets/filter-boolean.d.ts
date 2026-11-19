/// <reference path="helpers.d.ts" />

// `NoInfer<S>` stops contextual typing from flowing back through `S` when `.filter(Boolean)` is an
// argument, which would skip the structural checks of the elements. See
// https://github.com/total-typescript/ts-reset/issues/233.
//
// `S extends T` keeps TypeScript's overload resolution correct, so a predicate that is not
// `Boolean` on a union of arrays, such as `string[] | number[]`, falls through to the built-in
// signature.

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
