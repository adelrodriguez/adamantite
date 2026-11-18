import type * as Path from "effect/Path"
import * as Array from "effect/Array"
import * as Brand from "effect/Brand"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as String from "effect/String"

/**
 * A path relative to the project root, with `/` between folders, as git and Oxlint list files.
 * Discovery gives absolute paths, so the brand keeps one from reaching code that joins a project
 * path with the project root.
 */
export const ProjectPath = Schema.String.pipe(Schema.brand("ProjectPath"))

export type ProjectPath = typeof ProjectPath.Type

const ProjectPathBrand = Brand.nominal<ProjectPath>()

/**
 * The project path of `target`, an absolute path inside `cwd`. The root itself is `.`.
 */
export function toProjectPath(path: Path.Path, cwd: string, target: string): ProjectPath {
  return ProjectPathBrand((path.relative(cwd, target) || ".").split(path.sep).join("/"))
}

/**
 * What `git` prints on standard output for `args` in `cwd`. None when git fails, for example
 * outside a repository.
 */
const readGit = Effect.fn("readGit")(
  function* (cwd: string, args: readonly string[]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    const handle = yield* spawner.spawn(
      ChildProcess.make("git", args, { cwd, stderr: "ignore", stdin: "ignore" })
    )

    const [output, exitCode] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
      { concurrency: "unbounded" }
    )

    // Git prints nothing to stdout when it fails, so only the exit code tells an error apart.
    return Option.liftPredicate(output, () => exitCode === 0)
  },
  Effect.scoped,
  Effect.orElseSucceed(() => Option.none<string>())
)

/**
 * The files that `git ls-files` lists with `args` in `cwd`, as paths relative to `cwd` with `/`
 * between folders. None when git cannot list them, for example outside a repository.
 */
function listGitFiles(cwd: string, args: readonly string[]) {
  return readGit(cwd, ["ls-files", "-z", ...args]).pipe(
    Effect.map(
      Option.map((output) =>
        pipe(
          output,
          String.split("\0"),
          Array.filter((file) => String.isNonEmpty(file))
        )
      )
    )
  )
}

/**
 * The files below `cwd` that git tracks, and the new files that git does not ignore. `pathspecs`
 * limits the list, such as `["*.md"]`. Some tracked files can be missing from the working tree.
 */
export function listProjectFiles(cwd: string, pathspecs: readonly string[] = []) {
  return listGitFiles(cwd, ["--cached", "--others", "--exclude-standard", "--", ...pathspecs])
}

/**
 * The files in `folder`, a folder relative to `cwd`, that git ignores, such as build output,
 * without the files of `node_modules` folders.
 */
export function listIgnoredFiles(cwd: string, folder: string) {
  return listGitFiles(cwd, [
    "--others",
    "--ignored",
    "--exclude-standard",
    "--",
    folder,
    ":(exclude,glob)**/node_modules/**",
  ])
}

const COMMIT_HASH = /^(?:[\da-f]{40}|[\da-f]{64})$/u

/**
 * The commit hash on the first line of what a git plumbing command prints, of SHA-1 or SHA-256.
 * None when the line is something else, so a config that adds output cannot pass as a commit.
 */
function parseCommit(output: string) {
  const [line = ""] = output.trim().split(/\r?\n/u)

  return Option.liftPredicate(line.trim(), (hash) => COMMIT_HASH.test(hash))
}

/**
 * The commit that `HEAD` names in the repository of `cwd`. None in a repository without a commit,
 * or when git is unavailable.
 */
export function readHead(cwd: string) {
  return readGit(cwd, ["rev-parse", "--verify", "HEAD"]).pipe(
    Effect.map(Option.flatMap((output) => parseCommit(output)))
  )
}

/**
 * The best common ancestor of `commit` and `HEAD`. None when the repository does not have `commit`,
 * such as another clone after a squash merge or a shallow clone, when the two share no history, or
 * when git is unavailable.
 */
export function readMergeBase(cwd: string, commit: string) {
  return readGit(cwd, ["merge-base", commit, "HEAD"]).pipe(
    Effect.map(Option.flatMap((output) => parseCommit(output)))
  )
}
