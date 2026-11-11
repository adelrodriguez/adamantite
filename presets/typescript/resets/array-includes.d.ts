/// <reference path="helpers.d.ts" />

interface ReadonlyArray<T> {
  includes(
    searchElement: T | (AdamantiteTypeScript.WidenLiteral<T> & {}),
    fromIndex?: number
  ): boolean
}

interface Array<T> {
  includes(
    searchElement: T | (AdamantiteTypeScript.WidenLiteral<T> & {}),
    fromIndex?: number
  ): boolean
}
