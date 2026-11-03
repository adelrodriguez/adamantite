import { join } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { getProjectDirectory, PROJECT_VARIABLE } from "#lib/execution/oxlint-entry.ts"
import { resolveToolchain } from "#lib/integrations/tooling/oxlint/toolchain.ts"
import { ModuleResolver } from "#lib/workspace/module-resolver.ts"

// Run Oxlint with the toolchain of the project, and pass every argument through. Editors and
// `adamantite check` start this file in place of `oxlint`.

const project = getProjectDirectory(
  process.argv[1] ?? "",
  process.cwd(),
  process.env[PROJECT_VARIABLE]
)
const result = await Effect.runPromise(
  resolveToolchain(project).pipe(
    Effect.result,
    Effect.provide([NodeFileSystem.layer, NodePath.layer, ModuleResolver.layer])
  )
)

if (Result.isFailure(result)) {
  process.stderr.write(`${result.failure.message}\n`)
  process.exit(1)
}

const { backend, binding, oxlint } = result.success
const importOxlint = (file: string) => import(pathToFileURL(join(oxlint, "dist", file)).href)

if (backend._tag === "Replaced") {
  process.env["OXLINT_TSGOLINT_PATH"] = backend.path
}

// Oxlint loads its binding from `NAPI_RS_NATIVE_LIBRARY_PATH` once, when `bindings.js` loads. Every
// napi-rs package reads the same variable, such as `oxc-resolver` in a JS plugin, so it must not
// outlive that load. JS plugins load later, through dynamic imports in `cli.js`.
if (binding._tag === "Replaced") {
  process.env["NAPI_RS_NATIVE_LIBRARY_PATH"] = binding.path
  await importOxlint("bindings.js")
  delete process.env["NAPI_RS_NATIVE_LIBRARY_PATH"]
}

await importOxlint("cli.js")
