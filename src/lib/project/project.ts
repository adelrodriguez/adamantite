import type * as Result from "effect/Result"
import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { ConfigLoadFailed } from "#lib/shared/errors.ts"
import {
  type CustomRuleDiscovery,
  discoverCustomRules,
} from "#lib/project/custom-rules/discover.ts"
import { type LintConfig, readLintConfig } from "#lib/project/lint-config.ts"
import { type Lockfile, readLockfile } from "#lib/project/lockfile.ts"
import { readWorkspace, type Workspace } from "#lib/project/monorepo.ts"
import { getManagedScripts, readPackageJson, type Script } from "#lib/project/package-json.ts"

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
   * The root `oxlint.config.ts`, loaded as Oxlint loads it, or none when it does not exist.
   */
  readonly lintConfig: Option.Option<Result.Result<LintConfig, ConfigLoadFailed>>
  /**
   * The lockfile that `init` or `update` wrote, or none when the project has no lockfile.
   */
  readonly lockfile: Option.Option<Lockfile>
  readonly packageJson: PackageJson
  readonly workspace: Workspace
}

/**
 * Reads the project at `cwd`. Each part comes from this read, so a manifest from before an install
 * or a handoff cannot enter the snapshot.
 */
export const readProject = Effect.fn("readProject")(function* (cwd: string) {
  const path = yield* Path.Path

  const [packageJson, workspace, lintConfig, lockfile] = yield* Effect.all(
    [
      readPackageJson(cwd),
      readWorkspace(cwd),
      readLintConfig(path.join(cwd, LINT_CONFIG_FILE)),
      readLockfile(cwd),
    ],
    { concurrency: "unbounded" }
  )

  const customRules = yield* discoverCustomRules([cwd, ...workspace.packageDirectories])

  return { customRules, cwd, lintConfig, lockfile, packageJson, workspace } satisfies Project
})

/**
 * The managed scripts that the integrations apply for: the scripts that the lockfile selects, or,
 * in a project without a lockfile, the managed scripts in `package.json`.
 */
export function getSelectedScripts({ lockfile, packageJson }: Project): readonly Script[] {
  return Option.match(lockfile, {
    onNone: () => getManagedScripts(packageJson),
    onSome: ({ selection }) => selection.scripts,
  })
}
