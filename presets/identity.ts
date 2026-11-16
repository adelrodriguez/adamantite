// Adamantite reads a target project's configs by loading them, as Oxlint, Oxfmt, and Knip do, so it
// sees plain objects, not the imports that built them. Each preset names its module under this key.
// `Symbol.for` gives one key to every installed copy of Adamantite, as two copies of one package can
// load in a pnpm monorepo. A spread copies an enumerable symbol key, so a config such as
// `{ ...analyze, ignoreDependencies }` keeps it. The tools ignore symbol keys: Oxlint and Oxfmt send
// the config to Rust as JSON, and Knip checks only string keys.

/**
 * The key under which a preset object names the module that exports it.
 */
export const PRESET: symbol = Symbol.for("adamantite.preset")

/**
 * What a preset object holds under `PRESET`.
 */
export interface PresetIdentity {
  /**
   * The public module of the preset, such as `adamantite/lint/strict`.
   */
  readonly module: string
}
