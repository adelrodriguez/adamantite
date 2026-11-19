import process from "node:process"
import { pathToFileURL } from "node:url"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { getProjectDirectory, resolveOxlintLaunch } from "#lib/integrations/oxlint/entry.ts"
import * as Project from "#lib/project/index.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"

const entry = process.argv[1] ?? ""

const result = await Effect.runPromise(
  Effect.gen(function* () {
    const project = getProjectDirectory(entry, yield* Project.Directory)

    return yield* resolveOxlintLaunch(project)
  }).pipe(
    Effect.result,
    Effect.provide([
      NodeFileSystem.layer,
      NodePath.layer,
      ModuleResolver.layer,
      Project.Directory.layer,
    ])
  )
)

if (Result.isFailure(result)) {
  process.stderr.write(`${result.failure.message}\n`)
  process.exit(1)
}

const { cli, env, preload } = result.success

// Oxlint reads the variables when it loads.
for (const [name, value] of Object.entries(env)) {
  if (value === undefined) {
    // `process.env` is the environment of the process, not a record that a `Map` could replace.
    Reflect.deleteProperty(process.env, name)
  } else {
    process.env[name] = value
  }
}

if (Option.isSome(preload)) {
  await import(pathToFileURL(preload.value).href)
}

await import(pathToFileURL(cli).href)
