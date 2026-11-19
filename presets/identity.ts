export const PRESET: symbol = Symbol.for("adamantite.preset")

export interface PresetIdentity {
  readonly module: string
}
