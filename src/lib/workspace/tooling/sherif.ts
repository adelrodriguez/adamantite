import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import type { Finding } from "#lib/integrations/base.ts"
import { getManagedScripts } from "#lib/workspace/package-json.ts"

const LEGACY_SCRIPT_NAMES: ReadonlySet<string> = new Set(["check:monorepo", "fix:monorepo"])
const LEGACY_COMMAND_REGEX = /^adamantite\s+monorepo(?:\s|$)/u

interface SherifOption {
  readonly key: string
  readonly takesValue: boolean
}

/**
 * Sherif CLI flags and the camelCase keys of the `sherif` field that replace them. `--fix` is left
 * out on purpose: `adamantite analyze` selects fix mode per invocation, and a stored `fix: true`
 * makes a plain `analyze` change files.
 */
const SHERIF_OPTIONS: ReadonlyMap<string, SherifOption> = new Map([
  ["--fail-on-warnings", { key: "failOnWarnings", takesValue: false }],
  ["--ignore-dependency", { key: "ignoreDependency", takesValue: true }],
  ["--ignore-package", { key: "ignorePackage", takesValue: true }],
  ["--ignore-rule", { key: "ignoreRule", takesValue: true }],
  ["--no-install", { key: "noInstall", takesValue: false }],
  ["--select", { key: "select", takesValue: true }],
  ["-i", { key: "ignoreDependency", takesValue: true }],
  ["-p", { key: "ignorePackage", takesValue: true }],
  ["-r", { key: "ignoreRule", takesValue: true }],
  ["-s", { key: "select", takesValue: true }],
])

interface LegacyScript {
  readonly command: string
  readonly name: string
}

function getLegacyScripts(packageJson: PackageJson): LegacyScript[] {
  return Object.entries(packageJson.scripts ?? {}).flatMap(([name, command]) =>
    command !== undefined
    && (LEGACY_SCRIPT_NAMES.has(name) || LEGACY_COMMAND_REGEX.test(command.trim()))
      ? [{ command, name }]
      : []
  )
}

function getSettingGoals(script: LegacyScript): string[] {
  const tokens = script.command.trim().split(/\s+/u)
  const goals: string[] = []

  for (const [index, token] of tokens.entries()) {
    const [flag = token, inlineValue] = token.split("=", 2)
    const option = SHERIF_OPTIONS.get(flag)

    if (!option) {
      continue
    }

    if (!option.takesValue) {
      goals.push(`Set \`sherif.${option.key}\` to \`true\` in the root \`package.json\`.`)
      continue
    }

    const value = inlineValue ?? tokens[index + 1]

    if (value === undefined) {
      continue
    }

    goals.push(
      option.key === "select"
        ? `Set \`sherif.select\` to \`"${value}"\` in the root \`package.json\`.`
        : `Add \`"${value}"\` to the \`sherif.${option.key}\` array in the root \`package.json\`.`
    )
  }

  return goals
}

/**
 * Findings for what remains of the legacy monorepo scripts: a `check:monorepo` or `fix:monorepo`
 * script, or a script whose command starts with `adamantite monorepo`.
 */
export function getLegacyMonorepoScriptFindings(packageJson: PackageJson): Finding[] {
  const legacyScripts = getLegacyScripts(packageJson)

  if (legacyScripts.length === 0) {
    return []
  }

  const hasAnalyze = getManagedScripts(packageJson).includes("analyze")
  const scriptList = legacyScripts
    .map(({ command, name }) => `\`${name}\` (\`${command}\`)`)
    .join(", ")

  return [
    {
      currentState: `Legacy monorepo scripts are present in \`package.json\`: ${scriptList}.${hasAnalyze ? "" : " The project has no managed `analyze` script."}`,
      goal: [
        ...(hasAnalyze
          ? []
          : [
              "Adopt the managed `analyze` script with `adamantite init --non-interactive --script analyze`. It runs Sherif in a detected monorepo.",
            ]),
        // Paired scripts usually carry the same flags; one goal per setting is enough.
        ...Array.dedupe(legacyScripts.flatMap((script) => getSettingGoals(script))),
        ...legacyScripts.map(({ name }) => `Remove the \`${name}\` script from \`package.json\`.`),
      ],
      id: "legacy-monorepo-scripts",
      integration: "sherif",
      notes: [
        "`adamantite analyze` replaces `check:monorepo`, and `adamantite analyze --fix` replaces `fix:monorepo`. `adamantite analyze --only monorepo` runs only Sherif.",
        "`adamantite analyze` runs Sherif without flags. Sherif reads project exceptions from the `sherif` field of the root `package.json`, with the CLI options in camelCase: `ignoreDependency`, `ignoreRule`, `ignorePackage`, `select`, `noInstall`, and `failOnWarnings`.",
        "Doctor does not assess `AGENTS.md`. Remove the lines that mention the monorepo scripts from its Adamantite section.",
      ],
      title: "Legacy monorepo scripts",
    },
  ]
}
