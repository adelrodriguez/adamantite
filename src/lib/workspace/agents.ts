import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as String from "effect/String"
import { runScriptCommand, type PackageManagerName } from "nypm"
import { readFileIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { MANAGED_SCRIPT_COMMANDS, type Script } from "#lib/workspace/package-json.ts"

const AGENTS_NAME = "AGENTS.md"

export const ADAMANTITE_AGENTS_START_MARKER = "<!-- ADAMANTITE:START -->"
export const ADAMANTITE_AGENTS_END_MARKER = "<!-- ADAMANTITE:END -->"

interface WriteAgentsGuidanceOptions {
  readonly packageManager: PackageManagerName
  readonly scripts: Script[]
}

function getScriptGuidance(packageManager: PackageManagerName, script: Script) {
  const command = runScriptCommand(packageManager, script)
  const directCommand = MANAGED_SCRIPT_COMMANDS[script]

  switch (script) {
    case "analyze":
      return `- Run \`${command}\` after changing dependencies, imports, or exports. Direct command: \`${directCommand}\`.`
    case "check":
      return `- Run \`${command}\` to catch lint and type issues. Direct command: \`${directCommand}\`.`
    case "check:monorepo":
      return `- Run \`${command}\` to check monorepo package consistency. Direct command: \`${directCommand}\`.`
    case "fix":
      return `- Run \`${command}\` to apply safe lint fixes. Direct command: \`${directCommand}\`.`
    case "fix:monorepo":
      return `- Run \`${command}\` to fix monorepo package consistency. Direct command: \`${directCommand}\`.`
    case "format":
      return `- Run \`${command}\` after editing files. Direct command: \`${directCommand}\`.`
  }
}

function getAgentsSection({ packageManager, scripts }: WriteAgentsGuidanceOptions) {
  const scriptOrder: Script[] = [
    "format",
    "check",
    "fix",
    "analyze",
    "check:monorepo",
    "fix:monorepo",
  ]

  const selectedScriptGuidance = scriptOrder
    .filter((script) => scripts.includes(script))
    .map((script) => getScriptGuidance(packageManager, script))

  const body = [
    "## Adamantite",
    "",
    "This project uses Adamantite for its managed formatting, linting, type checking, and dependency-analysis setup.",
    "",
    ...(selectedScriptGuidance.length > 0
      ? [
          "- Prefer the package scripts Adamantite added for this workspace.",
          ...selectedScriptGuidance,
        ]
      : []),
    "- Run `adamantite doctor` and follow its findings to repair managed setup.",
  ].join("\n")

  return [ADAMANTITE_AGENTS_START_MARKER, "", body, "", ADAMANTITE_AGENTS_END_MARKER, ""].join("\n")
}

export const writeAgentsGuidance = (cwd: string, options: WriteAgentsGuidanceOptions) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const agentsPath = path.join(cwd, AGENTS_NAME)
    const existing = pipe(
      yield* readFileIfExists(agentsPath),
      Option.getOrElse(() => "")
    )
    const startIndex = pipe(existing, String.indexOf(ADAMANTITE_AGENTS_START_MARKER))
    const endIndex = pipe(existing, String.indexOf(ADAMANTITE_AGENTS_END_MARKER))
    const markerRange = pipe(
      Option.all({ end: endIndex, start: startIndex }),
      Option.filter(({ end, start }) => start < end)
    )
    const section = getAgentsSection(options)

    if (Option.isSome(markerRange)) {
      const { end, start } = markerRange.value
      const sectionEnd = end + ADAMANTITE_AGENTS_END_MARKER.length
      const nextContent = `${existing.slice(0, start)}${section.trimEnd()}${existing.slice(sectionEnd)}`

      yield* writeFile(agentsPath, nextContent.endsWith("\n") ? nextContent : `${nextContent}\n`)

      return "updated" as const
    }

    if (Option.isSome(startIndex) || Option.isSome(endIndex)) {
      return "malformed" as const
    }

    // Preserve existing trailing content and add only enough newlines for one blank line.
    const separator =
      existing.length === 0 || existing.endsWith("\n\n")
        ? ""
        : existing.endsWith("\n")
          ? "\n"
          : "\n\n"

    yield* writeFile(agentsPath, `${existing}${separator}${section}`)

    return "updated" as const
  })
