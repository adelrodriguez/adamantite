import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import type { FirstPartyPlugin } from "#presets/lint/plugins/entry.ts"
import type { Replacement } from "#presets/lint/plugins/shared/replacement.ts"
import { lintPresets } from "#lib/integrations/oxlint/presets.ts"
import * as Project from "#lib/project/index.ts"
import {
  type LintConfig,
  listJsPluginNames,
  listProjectOverrides,
} from "#lib/project/lint-config.ts"
import { publicImport } from "#lib/shared/package-exports.ts"
import { plugins } from "#presets/lint/plugins/catalog.ts"

// The type of the declaration checks this Schema, so the two cannot drift apart.
const ReplacementSchema: Schema.Codec<Replacement> = Schema.Struct({
  kind: Schema.Literal("overrides"),
  minimum: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  option: Schema.String,
  rules: Schema.NonEmptyArray(Schema.String),
  states: Schema.String,
  steps: Schema.Array(Schema.String),
})

const decodeReplacement = Schema.decodeUnknownOption(ReplacementSchema)

/**
 * A first-party rule and the hand-written config that it replaces.
 */
interface Declaration {
  readonly plugin: FirstPartyPlugin
  readonly replacement: Replacement
  readonly rule: string
}

/**
 * Each first-party rule that declares `meta.docs.replaces`. Oxlint lets a rule keep its own
 * properties in `meta.docs`, so the value is unknown until it decodes.
 */
export const declarations: readonly Declaration[] = Struct.keys(plugins).flatMap((plugin) =>
  Object.entries(plugins[plugin].rules).flatMap(([name, rule]) =>
    Option.toArray(decodeReplacement(rule.meta?.docs?.["replaces"])).map((replacement) => ({
      plugin,
      replacement,
      rule: `${plugin}/${name}`,
    }))
  )
)

/**
 * A rule setting that turns the rule on: a severity other than off, then the options.
 */
const isEnabled = Schema.is(
  Schema.TupleWithRest(Schema.Tuple([Schema.Literals(["deny", "error", "warn", 1, 2])]), [
    Schema.Unknown,
  ])
)

/**
 * The number of overrides that `config` has of the kind that `replacement` names: each turns on one
 * of its `rules` with its `option` set to a non-empty array.
 */
function countOverrides(config: LintConfig, { option, rules }: Replacement): number {
  const setsOption = Schema.is(Schema.Struct({ [option]: Schema.NonEmptyArray(Schema.Unknown) }))

  return listProjectOverrides(config).filter((override) =>
    rules.some((name) => {
      const setting = override.rules?.[name]

      return isEnabled(setting) && setting.slice(1).some((value) => setsOption(value))
    })
  ).length
}

/**
 * The step that loads the plugin of a rule, with the presets that load it, or none when `config`
 * loads it already.
 */
function toPluginStep(config: LintConfig, plugin: FirstPartyPlugin): readonly string[] {
  if (listJsPluginNames(config).includes(plugin)) {
    return []
  }

  const isPlugin = Schema.is(Schema.Struct({ name: Schema.Literal(plugin) }))

  const presets = lintPresets
    .filter(({ config: preset }) => (preset.jsPlugins ?? []).some((entry) => isPlugin(entry)))
    .map(({ name }) => `\`${publicImport(`./lint/${name}`)}\``)

  return [
    `Add ${new Intl.ListFormat("en-US", { type: "disjunction" }).format(presets)} to \`extends\` to load the \`${plugin}\` plugin.`,
  ]
}

/**
 * The warning for the config at `file` when it has enough overrides of the kind that a rule
 * replaces. The config is valid, so the report is a warning and fails no Doctor gate. Each step
 * takes its own numbered line.
 */
function toWarning(
  file: string,
  config: LintConfig,
  { plugin, replacement, rule }: Declaration
): Option.Option<string> {
  const count = countOverrides(config, replacement)

  if (count < replacement.minimum) {
    return Option.none()
  }

  const steps = [...toPluginStep(config, plugin), ...replacement.steps, "Run `adamantite check`."]

  return Option.some(
    [
      `\`${file}\` states ${replacement.states} by hand in ${count} \`${replacement.rules[0]}\` overrides with \`${replacement.option}\`. The \`${rule}\` rule states them in its options.`,
      ...steps.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n")
  )
}

/**
 * The warnings for each config that Oxlint loads in the project, the root config and the config of
 * each workspace package, that states by hand what a first-party rule states in its options. Oxlint
 * replaces override options within one config, so each config counts apart.
 */
export const listReplacementWarnings = Effect.fn("listReplacementWarnings")(function* (
  project: Project.Snapshot
) {
  const cwd = yield* Project.Directory
  const path = yield* Path.Path

  return Array.fromIterable(project.customRules.reads).flatMap(([file, read]) =>
    Result.isSuccess(read)
      ? declarations.flatMap((declaration) =>
          Option.toArray(toWarning(path.relative(cwd, file), read.success, declaration))
        )
      : []
  )
})
