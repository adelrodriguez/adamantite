import type * as PlatformError from "effect/PlatformError"
import type { JsonValue } from "type-fest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Str from "effect/String"
import { type FailedToParseFile, FailedToReadFile } from "#lib/shared/errors.ts"
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

const VERSION_FILES = [".node-version", ".nvmrc"] as const

const VoltaDeclaration = Schema.Struct({
  volta: Schema.Struct({ node: Schema.NonEmptyString }),
})

const EnginesDeclaration = Schema.Struct({
  engines: Schema.Struct({ node: Schema.NonEmptyString }),
})

const RuntimeEntry = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
})

function hasToolVersionsNodeEntry(content: string): boolean {
  return content
    .split("\n")
    .map((line) => line.split("#")[0]?.trim() ?? "")
    .some((line) => /^node(?:js)?\s+\S/.test(line))
}

function isNodeRuntimeEntry(value: JsonValue | undefined): boolean {
  return Schema.is(RuntimeEntry)(value) && value.name.toLowerCase() === "node"
}

/**
 * Recognizes the `package.json` Node.js declarations `actions/setup-node` supports: `volta.node`, a
 * `devEngines.runtime` entry named `node`, and `engines.node`. `actions/setup-node` remains
 * responsible for interpreting the selected field.
 */
function hasNodeDeclaration(packageJson: JsonValue): boolean {
  if (Schema.is(VoltaDeclaration)(packageJson)) {
    return true
  }

  if (Predicate.isObject(packageJson) && Predicate.isObject(packageJson.devEngines)) {
    const runtime = packageJson.devEngines.runtime
    const entries = Array.isArray(runtime) ? runtime : [runtime]

    if (entries.some((entry) => isNodeRuntimeEntry(entry))) {
      return true
    }
  }

  return Schema.is(EnginesDeclaration)(packageJson)
}

export class NodeVersionResolver extends Context.Service<
  NodeVersionResolver,
  {
    readonly resolve: (
      cwd: string
    ) => Effect.Effect<
      NodeVersionSource,
      FailedToParseFile | FailedToReadFile | PlatformError.PlatformError
    >
  }
>()("NodeVersionResolver") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
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
          for (const file of VERSION_FILES) {
            const content = yield* readDeclarationFile(cwd, file)

            if (content !== null && Str.isNonEmpty(content.trim())) {
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
  )
}
