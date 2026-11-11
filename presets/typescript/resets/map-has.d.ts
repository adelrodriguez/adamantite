/// <reference path="helpers.d.ts" />

interface Map<K, V> {
  has(value: K | (AdamantiteTypeScript.WidenLiteral<K> & {})): boolean
}

interface ReadonlyMap<K, V> {
  has(value: K | (AdamantiteTypeScript.WidenLiteral<K> & {})): boolean
}
