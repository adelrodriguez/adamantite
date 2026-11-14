import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

// Preview with `node scripts/rename-antislop.ts`. Apply with `--write`.
// Preserve historical decisions, releases, upstream links, and license notices.
const root = path.resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")

const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean)

for (const file of files) {
  if (
    file.startsWith("docs/adr/")
    || file === "CHANGELOG.md"
    || file === ".changeset/own-antislop-rules.md"
    || file.includes("rule-migrations")
    || file.startsWith("src/lib/integrations/tooling/oxlint/")
    || file.endsWith("rename-antislop.ts")
  ) {
    continue
  }

  const original = readFileSync(path.join(root, file), "utf8")

  const content = /license/iu.test(file)
    ? original
    : original
        .split(/(https:\/\/github\.com\/dmmulroy\/anti-slop[^\s)"`]*|\[anti-slop\])/u)
        .map((part) =>
          part.startsWith("https://github.com/dmmulroy/") || part === "[anti-slop]"
            ? part
            : part.replaceAll("anti-slop", "antislop")
        )
        .join("")

  const renamed = file.replaceAll("anti-slop", "antislop")

  if (content !== original || renamed !== file) {
    console.info(`${file} -> ${renamed}`)

    if (write) {
      writeFileSync(path.join(root, file), content)

      if (renamed !== file) {
        mkdirSync(path.dirname(path.join(root, renamed)), { recursive: true })
        renameSync(path.join(root, file), path.join(root, renamed))
      }
    }
  }
}
