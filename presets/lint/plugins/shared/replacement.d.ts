export interface Replacement {
  readonly kind: "overrides"
  readonly minimum: number
  readonly option: string
  readonly rules: readonly [string, ...string[]]
  readonly states: string
  readonly steps: readonly string[]
}
