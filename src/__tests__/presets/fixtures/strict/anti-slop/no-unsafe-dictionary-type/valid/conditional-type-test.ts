type Merge<T> = { readonly [K in keyof T]: T[K] }

export type IsPlain<T> = T extends Record<string, unknown> ? true : false

export type Plain<T> = Extract<T, Record<string, unknown>>

export type DeepMerge<T> = {
  readonly [K in keyof T]: T[K] extends Record<string, unknown> ? Merge<T[K]> : T[K]
}
