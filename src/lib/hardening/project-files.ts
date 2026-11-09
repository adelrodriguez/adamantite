import type * as Path from "effect/Path"
import * as Array from "effect/Array"
import * as Brand from "effect/Brand"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Stream from "effect/Stream"
import * as String from "effect/String"

/**
 * A path relative to the project root, with `/` between folders, as git and Oxlint list files.
 * Discovery gives absolute paths, so the brand keeps one from reaching code that joins a project
 * path with the project root.
 */
export type ProjectPath = string & Brand.Brand<"ProjectPath">

const ProjectPathBrand = Brand.nominal<ProjectPath>()

/**
 * The project path of `target`, an absolute path inside `cwd`. The root itself is `.`.
 */
export function toProjectPath(path: Path.Path, cwd: string, target: string): ProjectPath {
  return ProjectPathBrand((path.relative(cwd, target) || ".").split(path.sep).join("/"))
}

/**
 * The files that `git ls-files` lists with `args` in `cwd`, as paths relative to `cwd` with `/`
 * between folders. None when git cannot list them, for example outside a repository.
 */
const listGitFiles = Effect.fn("listGitFiles")(
  function* (cwd: string, args: readonly string[]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    const handle = yield* spawner.spawn(
      ChildProcess.make("git", ["ls-files", "-z", ...args], {
        cwd,
        stderr: "ignore",
        stdin: "ignore",
      })
    )

    const [output, exitCode] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
      { concurrency: "unbounded" }
    )

    const files = pipe(
      output,
      String.split("\0"),
      Array.filter((file) => String.isNonEmpty(file))
    )

    // Git prints nothing to stdout when it fails, so only the exit code tells an error apart.
    return Option.liftPredicate(files, () => exitCode === 0)
  },
  Effect.scoped,
  Effect.orElseSucceed(() => Option.none<string[]>())
)

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
