import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import {
  EffectBuildMissing,
  EffectPlatformUnsupported,
  PackageNotInstalled,
} from "#lib/shared/errors.ts"
import { readDirectoryIfExists } from "#lib/shared/filesystem.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const NAME = "@effect/tsgo"

/**
 * The Effect builds that replace the Oxlint native binding and the type-aware backend.
 */
export interface EffectToolchain {
  readonly backend: string
  readonly binding: string
}

const readVersion = Effect.fn("readVersion")(function* (directory: string) {
  const { version } = yield* readPackageJson(directory)
  return version ?? ""
})

/**
 * The one file in `artifacts/<tool>/<version>/` of the platform package that `isArtifact` accepts.
 * The version folder is missing when this `@effect/tsgo` release has no build of that version.
 */
const findArtifact = Effect.fn("findArtifact")(function* (
  platformDirectory: string,
  effectVersion: string,
  tool: EffectBuildMissing["tool"],
  version: string,
  isArtifact: (file: string) => boolean
) {
  const path = yield* Path.Path
  const toolDirectory = path.join(platformDirectory, "artifacts", tool)
  const files = yield* readDirectoryIfExists(path.join(toolDirectory, version))
  const artifact = pipe(
    files,
    Option.flatMap((entries) => Array.findFirst(entries, (file) => isArtifact(file)))
  )

  if (Option.isSome(artifact)) {
    return path.join(toolDirectory, version, artifact.value)
  }

  const supported = yield* readDirectoryIfExists(toolDirectory)

  return yield* new EffectBuildMissing({
    effectVersion,
    supported: Array.sort(
      Option.getOrElse(supported, () => []),
      Order.String
    ),
    tool,
    version,
  })
})

/**
 * The Effect builds of the Oxlint binding and tsgolint for the installed Oxlint and oxlint-tsgolint
 * versions. They come from the `@effect/tsgo` platform package, so the project needs no patch. None
 * when the project does not install `@effect/tsgo`.
 */
export const resolveEffectToolchain = Effect.fn("resolveEffectToolchain")(function* (
  project: string,
  oxlint: string
) {
  const tsgo = yield* resolvePackageDirectory(project, NAME)

  if (Option.isNone(tsgo)) {
    return Option.none<EffectToolchain>()
  }

  const platform = `${process.platform}-${process.arch}`
  const platformDirectory = yield* resolvePackageDirectory(tsgo.value, `${NAME}-${platform}`)

  if (Option.isNone(platformDirectory)) {
    return yield* new EffectPlatformUnsupported({ platform })
  }

  const tsgolint = yield* resolvePackageDirectory(oxlint, "oxlint-tsgolint")

  if (Option.isNone(tsgolint)) {
    return yield* new PackageNotInstalled({ packageName: "oxlint-tsgolint", project })
  }

  const [effectVersion, tsgolintVersion, oxlintVersion] = yield* Effect.all(
    [readVersion(tsgo.value), readVersion(tsgolint.value), readVersion(oxlint)],
    { concurrency: "unbounded" }
  )
  const tsgolintFile = process.platform === "win32" ? "tsgolint.exe" : "tsgolint"
  // `Result.all` takes the first failure in input order, so a project that has no build of either
  // version always gets the backend error.
  const artifacts = yield* Effect.all(
    [
      findArtifact(
        platformDirectory.value,
        effectVersion,
        "oxlint-tsgolint",
        tsgolintVersion,
        (file) => file === tsgolintFile
      ),
      findArtifact(platformDirectory.value, effectVersion, "oxlint", oxlintVersion, (file) =>
        file.endsWith(".node")
      ),
    ],
    { concurrency: "unbounded", mode: "result" }
  )
  const [backend, binding] = yield* Effect.fromResult(Result.all(artifacts))

  return Option.some<EffectToolchain>({ backend, binding })
})
