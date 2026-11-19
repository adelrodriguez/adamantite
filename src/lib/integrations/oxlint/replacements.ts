import type { Plugin } from "@oxlint/plugins"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Record from "effect/Record"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import type { FirstPartyPlugin } from "#presets/lint/plugins/entry.ts"
import type { Replacement } from "#presets/lint/plugins/shared/replacement.d.ts"
import { lintPresets } from "#lib/integrations/oxlint/presets.ts"
import * as Project from "#lib/project/index.ts"
import { type LintConfig, listJsPluginNames, listOverrides } from "#lib/project/lint-config.ts"
import { publicImport } from "#lib/shared/package-exports.ts"
import adamantite from "#presets/lint/plugins/adamantite/index.ts"
import qualityEffect from "#presets/lint/plugins/quality-effect/index.ts"
import quality from "#presets/lint/plugins/quality/index.ts"
import testing from "#presets/lint/plugins/testing/index.ts"

const plugins: Readonly<Record<FirstPartyPlugin, Plugin>> = {
  adamantite,
  quality,
  "quality-effect": qualityEffect,
  testing,
}

const ReplacementSchema: Schema.Codec<Replacement> = Schema.Struct({
  kind: Schema.Literal("overrides"),
  minimum: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  option: Schema.String,
  rules: Schema.NonEmptyArray(Schema.String),
  states: Schema.String,
  steps: Schema.Array(Schema.String),
})

const decodeReplacement = Schema.decodeUnknownOption(ReplacementSchema)

interface Declaration {
  readonly plugin: FirstPartyPlugin
  readonly replacement: Replacement
  readonly rule: string
}

// Oxlint lets a rule keep its own properties in `meta.docs`, so the value is unknown until it
// decodes.
export const declarations: readonly Declaration[] = Struct.keys(plugins).flatMap((plugin) =>
  Object.entries(plugins[plugin].rules).flatMap(([name, rule]) =>
    Option.toArray(decodeReplacement(rule.meta?.docs?.["replaces"])).map((replacement) => ({
      plugin,
      replacement,
      rule: `${plugin}/${name}`,
    }))
  )
)

const isEnabled = Schema.is(
  Schema.TupleWithRest(Schema.Tuple([Schema.Literals(["deny", "error", "warn", 1, 2])]), [
    Schema.Unknown,
  ])
)

function countOverrides(config: LintConfig, { option, rules }: Replacement): number {
  const setsOption = Schema.is(Schema.Struct({ [option]: Schema.NonEmptyArray(Schema.Unknown) }))

  return listOverrides(config).filter((override) =>
    rules.some((name) => {
      const setting = override.rules?.[name]

      return isEnabled(setting) && setting.slice(1).some((value) => setsOption(value))
    })
  ).length
}

function toPluginStep(
  file: string,
  config: LintConfig,
  plugin: FirstPartyPlugin
): readonly string[] {
  if (listJsPluginNames(config).includes(plugin)) {
    return []
  }

  const isPlugin = Schema.is(Schema.Struct({ name: Schema.Literal(plugin) }))

  const loading = lintPresets.filter(({ config: preset }) =>
    (preset.jsPlugins ?? []).some((entry) => isPlugin(entry))
  )

  const ruleless = loading.filter(({ config: preset }) =>
    Record.isEmptyReadonlyRecord(preset.rules ?? {})
  )

  const presets = (ruleless.length > 0 ? ruleless : loading).map(
    ({ name }) => `\`${publicImport(`./lint/${name}`)}\``
  )

  return [
    `Import ${new Intl.ListFormat("en-US", { type: "disjunction" }).format(presets)} in \`${file}\`, and add it to \`extends\` after the core preset. It loads the \`${plugin}\` plugin.`,
  ]
}

function toWarning(
  file: string,
  config: LintConfig,
  { plugin, replacement, rule }: Declaration
): Option.Option<string> {
  const count = countOverrides(config, replacement)

  if (count < replacement.minimum) {
    return Option.none()
  }

  const steps = [
    ...toPluginStep(file, config, plugin),
    ...replacement.steps,
    "Run `adamantite check`.",
  ]

  return Option.some(
    [
      `\`${file}\` states ${replacement.states} by hand in ${count} \`${replacement.rules[0]}\` overrides with \`${replacement.option}\`. The \`${rule}\` rule states them in its options.`,
      ...steps.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n")
  )
}

// Oxlint replaces override options within one config, so each config counts apart.
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
