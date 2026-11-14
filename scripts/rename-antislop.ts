import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import process from "node:process"

// Preview with `node scripts/rename-antislop.ts`. Apply with `--write`.
// Preserve historical decisions, releases, upstream links, and license notices.
const root = path.resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")

const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((file) => file.length > 0 && existsSync(path.join(root, file)))

for (const file of files) {
  if (
    file.startsWith("docs/adr/")
    || file === "CHANGELOG.md"
    || file === ".changeset/own-antislop-rules.md"
    || file.includes("rule-migrations")
    || file.startsWith("src/lib/integrations/tooling/oxlint/")
    || file.endsWith("rename-antislop.ts")
    || file.endsWith("antislop-rename.test.ts")
    || file.endsWith("suppressions.test.ts")
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

        for (
          let directory = path.dirname(file);
          directory.includes("anti-slop");
          directory = path.dirname(directory)
        ) {
          const absolute = path.join(root, directory)

          // Stop at a folder with other tracked files or untracked project files.
          if (readdirSync(absolute).length > 0) {
            break
          }

          rmdirSync(absolute)
        }
      }
    }
  }
}
