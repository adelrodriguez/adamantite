import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { runScriptCommand, type PackageManagerName } from "nypm"
import { FailedToReadFile, FailedToWriteFile } from "#lib/shared/errors.ts"
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
    "- Use `adamantite doctor` to inspect managed setup and `adamantite doctor --fix` for safe local fixes.",
  ].join("\n")

  return [ADAMANTITE_AGENTS_START_MARKER, "", body, "", ADAMANTITE_AGENTS_END_MARKER, ""].join("\n")
}

export const writeAgentsGuidance = (cwd: string, options: WriteAgentsGuidanceOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const agentsPath = path.join(cwd, AGENTS_NAME)
    const exists = yield* fs
      .exists(agentsPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: agentsPath })))
    const existing = exists
      ? yield* fs
          .readFileString(agentsPath)
          .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: agentsPath })))
      : ""
    const start = existing.indexOf(ADAMANTITE_AGENTS_START_MARKER)
    const endMarkerIndex = existing.indexOf(ADAMANTITE_AGENTS_END_MARKER)
    const section = getAgentsSection(options)

    if (start !== -1 && endMarkerIndex !== -1 && start < endMarkerIndex) {
      const end = endMarkerIndex + ADAMANTITE_AGENTS_END_MARKER.length
      const nextContent = `${existing.slice(0, start)}${section.trimEnd()}${existing.slice(end)}`

      yield* fs
        .writeFileString(agentsPath, nextContent.endsWith("\n") ? nextContent : `${nextContent}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: agentsPath })))

      return "updated" as const
    }

    if (start !== -1 || endMarkerIndex !== -1) {
      return "malformed" as const
    }

    // Preserve existing trailing content and add only enough newlines for one blank line.
    const separator =
      existing.length === 0 || existing.endsWith("\n\n")
        ? ""
        : existing.endsWith("\n")
          ? "\n"
          : "\n\n"

    yield* fs
      .writeFileString(agentsPath, `${existing}${separator}${section}`)
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: agentsPath })))

    return "updated" as const
  })
