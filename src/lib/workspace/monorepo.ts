import process from "node:process"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { readPackageJson } from "#lib/workspace/package-json.ts"

export const checkIsMonorepo = (cwd: string = process.cwd()) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const pnpmWorkspace = yield* fs.exists(path.join(cwd, "pnpm-workspace.yaml"))

    if (pnpmWorkspace) {
      return true
    }

    const packageJson = yield* readPackageJson(cwd)
    return packageJson.workspaces !== undefined
  })
