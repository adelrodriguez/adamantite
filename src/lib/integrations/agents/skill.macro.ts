import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import * as Array from "effect/Array"
import * as Order from "effect/Order"

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
