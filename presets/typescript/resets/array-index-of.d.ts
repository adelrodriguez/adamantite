/// <reference path="helpers.d.ts" />

interface ReadonlyArray<T> {
  lastIndexOf(
    searchElement: T | (AdamantiteTypeScript.WidenLiteral<T> & {}),
    fromIndex?: number
  ): number
  indexOf(
    searchElement: T | (AdamantiteTypeScript.WidenLiteral<T> & {}),
    fromIndex?: number
  ): number
}

interface Array<T> {
  lastIndexOf(
    searchElement: T | (AdamantiteTypeScript.WidenLiteral<T> & {}),
    fromIndex?: number
  ): number
  indexOf(
    searchElement: T | (AdamantiteTypeScript.WidenLiteral<T> & {}),
    fromIndex?: number
  ): number
}
