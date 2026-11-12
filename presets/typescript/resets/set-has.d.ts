/// <reference path="helpers.d.ts" />

interface Set<T> {
  has(value: T | (AdamantiteTypeScript.WidenLiteral<T> & {})): boolean
}

interface ReadonlySet<T> {
  has(value: T | (AdamantiteTypeScript.WidenLiteral<T> & {})): boolean
}
