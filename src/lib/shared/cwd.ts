import { cwd } from "node:process"
import * as Context from "effect/Context"

/**
 * The folder that a command runs in, which is the target project. It is the one reader of the
 * process working directory, so a test provides the folder instead of changing the process.
 */
export const Cwd = Context.Reference<string>("adamantite/Cwd", { defaultValue: () => cwd() })
