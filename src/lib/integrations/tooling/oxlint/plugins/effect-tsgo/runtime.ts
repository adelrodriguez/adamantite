import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import type { NativeOverride } from "#lib/integrations/tooling/oxlint/plugins/base.ts"
import {
  EffectBuildMissing,
  EffectPlatformUnsupported,
  PackageNotInstalled,
} from "#lib/shared/errors.ts"
import { readDirectoryIfExists } from "#lib/shared/filesystem.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const NAME = "@effect/tsgo"

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
 * The Effect builds of the Oxlint binding and tsrs for the installed Oxlint and tsrs versions. They
 * come from the `@effect/tsgo` platform package, so the project needs no patch. No overrides when
 * the project does not install `@effect/tsgo`.
 */
export const resolveEffectRuntime = Effect.fn("resolveEffectRuntime")(function* (
  project: string,
  oxlint: string
) {
  const tsgo = yield* resolvePackageDirectory(project, NAME)

  if (Option.isNone(tsgo)) {
    return [] satisfies readonly NativeOverride[]
  }

  const platform = `${process.platform}-${process.arch}`
  const platformDirectory = yield* resolvePackageDirectory(tsgo.value, `${NAME}-${platform}`)

  if (Option.isNone(platformDirectory)) {
    return yield* new EffectPlatformUnsupported({ platform })
  }

  const tsrs = yield* resolvePackageDirectory(project, "tsrs")

  if (Option.isNone(tsrs)) {
    return yield* new PackageNotInstalled({ packageName: "tsrs", project })
  }

  const [effectVersion, tsrsVersion, oxlintVersion] = yield* Effect.all(
    [readVersion(tsgo.value), readVersion(tsrs.value), readVersion(oxlint)],
    { concurrency: "unbounded" }
  )

  const tsrsFile = process.platform === "win32" ? "tsrs.exe" : "tsrs"

  // Resolve the backend first so a project missing both builds always gets the backend error.
  const backend = yield* findArtifact(
    platformDirectory.value,
    effectVersion,
    "tsrs",
    tsrsVersion,
    (file) => file === tsrsFile
  )

  const binding = yield* findArtifact(
    platformDirectory.value,
    effectVersion,
    "oxlint",
    oxlintVersion,
    (file) => file.endsWith(".node")
  )

  // With the mode `tsrs`, the Effect binding starts the backend as `<path> --lint headless`.
  return [
    { _tag: "Binding", path: binding },
    {
      _tag: "Backend",
      env: { EFFECT_TSGO_TSGOLINT_MODE: "tsrs", EFFECT_TSGO_TSGOLINT_PATH: backend },
    },
  ] satisfies readonly NativeOverride[]
})
