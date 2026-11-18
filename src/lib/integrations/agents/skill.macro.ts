import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import * as Array from "effect/Array"
import * as Order from "effect/Order"

/**
 * Build-time macro that inlines every file of each shipped skill into the bundle, so the skills
 * that `init` and `update` write always match the running Adamantite build, without `node_modules`
 * or the network. The keys are POSIX paths relative to `skills/`, such as `adamantite/SKILL.md`, in
 * sorted order. The first folder of a key is the name of its skill, so a new skill is a new folder
 * of `skills/`, and the `agents` integration writes and assesses it without a code change. A folder
 * that starts with `_` is not a skill, and the package does not ship it.
 */
export function getShippedSkillFiles(): Record<string, string> {
  const root = fileURLToPath(new URL("../../../../skills/", import.meta.url))

  const files = Array.sort(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"))
      .filter((file) => file.includes("/") && !file.startsWith("_")),
    Order.String
  )

  return Object.fromEntries(files.map((file) => [file, readFileSync(join(root, file), "utf8")]))
}
