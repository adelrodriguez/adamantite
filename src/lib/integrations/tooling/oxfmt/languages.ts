import type { FormatConfig } from "oxfmt"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as SemVer from "effect/SemVer"
import * as SemVerRange from "effect/SemVerRange"
import type { Finding } from "#lib/integrations/base.ts"
import type { Project } from "#lib/workspace/project.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

/**
 * A language that Oxfmt formats only through a bundled Prettier plugin, which imports a package
 * from the project.
 */
interface PluginLanguage {
  /**
   * The language names that the editor settings use.
   */
  readonly editors: { readonly vscode: string; readonly zed: string }
  /**
   * The package whose declaration in `package.json` marks a project that uses the language.
   */
  readonly framework: string
  readonly name: string
  /**
   * The Oxfmt option that turns the plugin on. The format preset sets it.
   */
  readonly option: keyof FormatConfig
  /**
   * The package that the plugin imports from the project. The installed Oxfmt names the versions
   * that it supports as an optional peer dependency.
   */
  readonly requires: string
  /**
   * How a project gets a supported version of `requires`.
   */
  readonly upgrade: string
}

/**
 * The plugin languages. A test fails when this list and the optional peers of Oxfmt disagree, or
 * when the format preset does not turn on one of them.
 */
export const pluginLanguages = [
  {
    editors: { vscode: "astro", zed: "Astro" },
    framework: "astro",
    name: "Astro",
    option: "astro",
    requires: "@astrojs/compiler-rs",
    upgrade:
      "Update `astro` to 7.0.0 or later, which depends on `@astrojs/compiler-rs`. If the package manager does not make dependencies of dependencies available to Oxfmt, add `@astrojs/compiler-rs` as a devDependency.",
  },
  {
    editors: { vscode: "svelte", zed: "Svelte" },
    framework: "svelte",
    name: "Svelte",
    option: "svelte",
    requires: "svelte",
    upgrade: "Update `svelte` to 5.0.0 or later.",
  },
] as const satisfies readonly PluginLanguage[]

/**
 * The findings for each plugin language whose framework `package.json` declares, but whose required
 * package Oxfmt cannot load in a supported version. Oxfmt imports the package from its own package
 * folder, so the check resolves it from there. Package assessment reports a missing Oxfmt, so this
 * check skips it.
 */
export const assessPluginLanguages = Effect.fn("assessPluginLanguages")(function* ({
  cwd,
  packageJson,
}: Project) {
  const oxfmt = yield* resolvePackageDirectory(cwd, "oxfmt")

  if (Option.isNone(oxfmt)) {
    return [] satisfies readonly Finding[]
  }

  const { peerDependencies = {}, version: oxfmtVersion = "" } = yield* readPackageJson(oxfmt.value)

  const findings = yield* Effect.forEach(
    pluginLanguages,
    (language) =>
      Effect.gen(function* () {
        const declared =
          packageJson.devDependencies?.[language.framework]
          ?? packageJson.dependencies?.[language.framework]

        const range = peerDependencies[language.requires]

        if (declared === undefined || range === undefined) {
          return []
        }

        const installed = yield* resolvePackageDirectory(oxfmt.value, language.requires)

        const installedVersion = Option.isSome(installed)
          ? (yield* readPackageJson(installed.value)).version
          : undefined

        // A range or a version that does not parse is not supported.
        const supported =
          installedVersion !== undefined
          && Result.all([SemVerRange.parse(range), SemVer.parse(installedVersion)]).pipe(
            Result.map(([supportedRange, version]) => SemVerRange.matches(supportedRange, version)),
            Result.getOrElse(() => false)
          )

        if (supported) {
          return []
        }

        const state =
          installedVersion === undefined
            ? `\`${language.requires}\` is not installed`
            : `\`${language.requires}\` ${installedVersion} is installed`

        return [
          {
            currentState: `\`package.json\` declares \`${language.framework}\` as \`${declared}\`, but ${state}. Oxfmt ${oxfmtVersion} formats ${language.name} files only with \`${language.requires}\` ${range}, so it fails on each of them.`,
            goal: [`Make \`${language.requires}\` ${range} available to Oxfmt.`, language.upgrade],
            id: `unavailable-${language.option}-plugin`,
            integration: "oxfmt",
            notes: ["Verification: run `adamantite check --only format` after the repair."],
            title: `Oxfmt cannot format ${language.name} files`,
          } satisfies Finding,
        ]
      }),
    // Each language reads its own package, and `forEach` keeps the findings in list order.
    { concurrency: "unbounded" }
  )

  return findings.flat()
})
