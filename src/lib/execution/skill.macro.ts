import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import * as Array from "effect/Array"
import * as Order from "effect/Order"

/**
 * Build-time macro that inlines every file of the shipped Adamantite skill into the bundle, so the
 * skill that `init` and `update` write always matches the running Adamantite build. The keys are
 * POSIX paths relative to `skills/adamantite/`, in sorted order.
 */
export function getShippedSkillFiles(): Record<string, string> {
  const root = fileURLToPath(new URL("../../../skills/adamantite/", import.meta.url))
  const files = Array.sort(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join("/")),
    Order.String
  )

  return Object.fromEntries(files.map((file) => [file, readFileSync(join(root, file), "utf8")]))
}
