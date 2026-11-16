import { join } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { getProjectDirectory, PROJECT_VARIABLE } from "#lib/integrations/oxlint/entry.ts"
import {
  ReplacedPart,
  resolveOxlintRuntime,
  toBackendEnv,
  TsrsBackend,
} from "#lib/integrations/oxlint/runtime.ts"
import * as Project from "#lib/project/index.ts"
import { readSelection } from "#lib/project/lockfile.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { toToolNotSelected } from "#lib/project/selection.ts"

// Run Oxlint with the Oxlint runtime of the project, and pass every argument through. Editors and
// `adamantite check` start this file in place of `oxlint`.

const entry = process.argv[1] ?? ""

const result = await Effect.runPromise(
  Effect.gen(function* () {
    const named = yield* Config.String(PROJECT_VARIABLE).pipe(Config.withDefault(""))
    const project = getProjectDirectory(entry, yield* Project.Directory, named)

    return yield* resolveOxlintRuntime(project).pipe(
      // Without a selected script that runs Oxlint, Setup did not install it, and
      // `adamantite update` would not either, so the failure names the script to add.
      Effect.catchTag("PackageNotInstalled", (error) =>
        readSelection(project).pipe(
          Effect.flatMap((selection) =>
            Effect.fail(
              Option.getOrElse(toToolNotSelected(selection, error.packageName), () => error)
            )
          )
        )
      )
    )
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

const { backend, binding, oxlint } = result.success
const importOxlint = (file: string) => import(pathToFileURL(join(oxlint, "dist", file)).href)

// A tsrs backend owns `OXLINT_TSGOLINT_PATH`. Outside Windows, Oxlint finds the launcher itself, so an
// inherited path, such as one to an old tsgolint, must not win over that search.
if (backend instanceof TsrsBackend) {
  delete process.env["OXLINT_TSGOLINT_PATH"]
}

Object.assign(process.env, toBackendEnv(backend))

// Oxlint loads its binding from `NAPI_RS_NATIVE_LIBRARY_PATH` once, when `bindings.js` loads. Every
// napi-rs package reads the same variable, such as `oxc-resolver` in a JS plugin, so it must not
// outlive that load. JS plugins load later, through dynamic imports in `cli.js`.
if (binding instanceof ReplacedPart) {
  process.env["NAPI_RS_NATIVE_LIBRARY_PATH"] = binding.path
  await importOxlint("bindings.js")
  delete process.env["NAPI_RS_NATIVE_LIBRARY_PATH"]
}

await importOxlint("cli.js")
