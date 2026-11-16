// A declaration file, so the build ships no module for a type that only rules and Doctor read.

/**
 * Config that a project writes by hand to state what a first-party rule states in its options. A
 * rule declares it in `meta.docs.replaces`, and Doctor warns about each loaded config that has it,
 * with the steps that move it into the rule.
 */
export interface Replacement {
  /**
   * The kind of hand-written config: `overrides` entries that each turn on one of `rules` with
   * `option` set to a non-empty array.
   */
  readonly kind: "overrides"
  /**
   * The fewest such overrides that state what the rule states.
   */
  readonly minimum: number
  /**
   * The option that marks an override as hand-written config of the rule, such as `patterns`.
   */
  readonly option: string
  /**
   * Each name that Oxlint accepts for the replaced rule, such as `eslint/no-restricted-imports`.
   * The warning names the rule by the first one.
   */
  readonly rules: readonly [string, ...string[]]
  /**
   * What the overrides state, such as `import layers`.
   */
  readonly states: string
  /**
   * The steps that move the overrides into the options of the rule, in order.
   */
  readonly steps: readonly string[]
}
