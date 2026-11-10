// A relative import of a project module is the same import as its alias.
import { readWorkspace } from "./monorepo.ts"

export const workspace = readWorkspace()
