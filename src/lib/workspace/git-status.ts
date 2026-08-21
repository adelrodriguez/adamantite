import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const execFilePromise = promisify(execFile)

interface GitStatusService {
  readonly isDirty: (cwd: string) => Effect.Effect<boolean>
}

export class GitStatus extends Context.Service<GitStatus, GitStatusService>()("GitStatus") {
  static readonly layer = Layer.succeed(this)({
    isDirty: (cwd) =>
      Effect.tryPromise(() => execFilePromise("git", ["status", "--porcelain"], { cwd })).pipe(
        Effect.map(({ stdout }) => stdout.trim().length > 0),
        Effect.orElseSucceed(() => true)
      ),
  })
}
