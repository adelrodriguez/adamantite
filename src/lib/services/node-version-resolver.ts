import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { FailedToReadFile } from "#lib/shared/errors.ts"
import { parseJson } from "#lib/shared/json.ts"

/**
 * A workflow-ready Node.js version input for `actions/setup-node`. `File` renders as
 * `node-version-file` so the workflow keeps tracking the target project's declaration; `Version`
 * renders as a literal `node-version` value.
 */
export type NodeVersionSource =
  | {
      readonly _tag: "File"
      readonly path: string
    }
  | {
      readonly _tag: "Version"
      readonly value: string
    }

function fileSource(path: string): NodeVersionSource {
  return { _tag: "File", path }
}

function versionSource(value: string): NodeVersionSource {
  return { _tag: "Version", value }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
}

function hasToolVersionsNodeEntry(content: string): boolean {
  return content
    .split("\n")
    .map((line) => line.split("#")[0]?.trim() ?? "")
    .some((line) => /^node(?:js)?\s+\S/.test(line))
}

function isNodeRuntimeEntry(value: unknown): boolean {
  return (
    isJsonRecord(value) &&
    isNonEmptyString(value.name) &&
    value.name.toLowerCase() === "node" &&
    isNonEmptyString(value.version)
  )
}

/**
 * Recognizes the `package.json` Node.js declarations `actions/setup-node` supports: `volta.node`, a
 * `devEngines.runtime` entry named `node`, and `engines.node`. `actions/setup-node` remains
 * responsible for interpreting the selected field.
 */
function hasNodeDeclaration(packageJson: unknown): boolean {
  if (!isJsonRecord(packageJson)) {
    return false
  }

  const volta = packageJson.volta
  if (isJsonRecord(volta) && isNonEmptyString(volta.node)) {
    return true
  }

  const devEngines = packageJson.devEngines
  if (isJsonRecord(devEngines)) {
    const runtime = devEngines.runtime
    const entries = Array.isArray(runtime) ? runtime : [runtime]

    if (entries.some((entry) => isNodeRuntimeEntry(entry))) {
      return true
    }
  }

  const engines = packageJson.engines
  return isJsonRecord(engines) && isNonEmptyString(engines.node)
}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const readDeclarationFile = (cwd: string, file: string) =>
    Effect.gen(function* () {
      const filePath = path.join(cwd, file)
      const exists = yield* fs.exists(filePath)

      if (!exists) {
        return null
      }

      return yield* fs
        .readFileString(filePath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: filePath })))
    })

  return {
    resolve: Effect.fn("NodeVersionResolver.resolve")(function* (cwd: string) {
      for (const file of [".node-version", ".nvmrc"]) {
        const content = yield* readDeclarationFile(cwd, file)

        if (content !== null && content.trim() !== "") {
          return fileSource(file)
        }
      }

      const toolVersions = yield* readDeclarationFile(cwd, ".tool-versions")

      if (toolVersions !== null && hasToolVersionsNodeEntry(toolVersions)) {
        return fileSource(".tool-versions")
      }

      const packageJsonContent = yield* readDeclarationFile(cwd, "package.json")

      if (packageJsonContent !== null) {
        const packageJson = yield* parseJson(packageJsonContent, path.join(cwd, "package.json"))

        if (hasNodeDeclaration(packageJson)) {
          return fileSource("package.json")
        }
      }

      return versionSource("lts/*")
    }),
  }
})

export class NodeVersionResolver extends Context.Service<
  NodeVersionResolver,
  Effect.Success<typeof make>
>()("NodeVersionResolver") {
  static readonly layer = Layer.effect(this, make)
}
