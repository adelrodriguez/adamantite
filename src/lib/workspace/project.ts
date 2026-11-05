import type * as Option from "effect/Option"
import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import {
  type CustomRuleDiscovery,
  discoverCustomRules,
} from "#lib/workspace/custom-rules/discover.ts"
import { readWorkspace, type Workspace } from "#lib/workspace/monorepo.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const LINT_CONFIG_FILE = "oxlint.config.ts"

/**
 * The facts about a target project that several assessments share. It is a snapshot: a coding agent
 * or an install can change the project, so each reassessment reads a new one.
 */
export interface Project {
  /**
   * The `custom()` calls that the Oxlint configs of the root and the workspace packages reach.
   */
  readonly customRules: CustomRuleDiscovery
  readonly cwd: string
  /**
   * The content of the root `oxlint.config.ts`, or none when it does not exist.
   */
  readonly lintConfig: Option.Option<string>
  readonly packageJson: PackageJson
  readonly workspace: Workspace
}

/**
 * Reads the project at `cwd`. Reads `package.json` unless a parsed manifest is provided.
 */
export const readProject = Effect.fn("readProject")(function* (
  cwd: string,
  manifest?: PackageJson
) {
  const path = yield* Path.Path
  const [packageJson, workspace, lintConfig] = yield* Effect.all(
    [
      manifest === undefined ? readPackageJson(cwd) : Effect.succeed(manifest),
      readWorkspace(cwd),
      readFileIfExists(path.join(cwd, LINT_CONFIG_FILE)),
    ],
    { concurrency: "unbounded" }
  )
  const customRules = yield* discoverCustomRules([cwd, ...workspace.packageDirectories])

  return { customRules, cwd, lintConfig, packageJson, workspace } satisfies Project
})
