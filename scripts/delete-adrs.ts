import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"

// Delete the architecture decision records and the pointers to them, from the repository root.
// Preview with `node scripts/delete-adrs.ts`, or apply with `--write`. Optional file paths limit
// the run to the first hand-checked unit. The pointers that this script does not match change by
// hand, and the script lists each one that remains.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = process.argv.slice(2).filter((argument) => argument !== "--write")

// Released history keeps its pointers. The test fixtures model the ADRs of a target project.
function checkIsKept(file: string) {
  return (
    file.startsWith("docs/adr/")
    || file === "CHANGELOG.md"
    || file.startsWith(".changeset/")
    || file.includes("__tests__/")
    || file === "scripts/delete-adrs.ts"
  )
}

const number = String.raw`(?:ADR\s+)?\d{4}`
const list = String.raw`ADR\s+\d{4}(?:(?:,\s+|,?\s+and\s+)${number})*`
const link = String.raw`\[ADR \d{4}\]\([^)]*\)`

// Each pattern removes a whole pointer, so the sentence around it still reads.
const pointers = [
  // "See ADR 0018, ADR 0019, and ADR 0022." and "See [ADR 0005](...) for the criteria."
  new RegExp(String.raw`[ \t]*\bSee\s+(?:${link}|${list})(?:\s+for the criteria)?\.`, "g"),
  // "runs stock Oxlint, as ADR 0021 says." and "first-party plugins, as ADR 0027 records."
  new RegExp(String.raw`,\s+as\s+${list}\s+(?:says|records)`, "g"),
  // "# in a separate step: see ADR 0003."
  new RegExp(String.raw`:\s+see\s+${list}(?=\.)`, "g"),
] as const

const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((file) => file.length > 0 && existsSync(resolve(root, file)) && !checkIsKept(file))
  .filter((file) => selected.length === 0 || selected.includes(file))

for (const file of files) {
  const path = resolve(root, file)
  const before = readFileSync(path, "utf8")
  const after = pointers.reduce((text, pointer) => text.replace(pointer, ""), before)

  if (after === before) {
    continue
  }

  console.info(`${write ? "updated" : "would update"} ${file}`)

  if (write) {
    writeFileSync(path, after)
  }
}

if (write && selected.length === 0) {
  rmSync(resolve(root, "docs/adr"), { recursive: true })
  console.info("removed docs/adr")
}

// `git grep` exits 1 when nothing matches, so read its output whatever its status.
const remaining = spawnSync(
  "git",
  ["grep", "-n", "-E", String.raw`docs/adr|\./adr/|ADR ?[0-9]{4}`, "--", ...files],
  { cwd: root, encoding: "utf8" }
).stdout.trim()

if (remaining.length > 0) {
  console.info(`\nchange these pointers by hand:\n${remaining}`)
}
