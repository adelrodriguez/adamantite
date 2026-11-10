import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"

// Replay issue #639 from the repository root. Preview with `node scripts/move-rule-test-add.ts`,
// or apply with `--write`. Optional file paths limit the run to the first hand-checked unit.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = process.argv.slice(2).filter((argument) => argument !== "--write")

// `src/commands/rule.ts` and its tests change by hand. CHANGELOG.md never named the former route,
// so no released history keeps it.
const files = [
  "README.md",
  "skills/adamantite/references/custom-rules.md",
  "docs/architecture.md",
  "docs/adr/0009-custom-rules-load-through-custom.md",
  "src/lib/integrations/tooling/oxlint/custom.ts",
  "src/lib/workspace/custom-rules/stub.macro.ts",
  "scripts/test-smoke.ts",
  ".changeset/scaffold-rule-tests.md",
  ".changeset/symlinked-paths.md",
] as const

const replacements = [
  ["rule add test", "rule test add"],
  ['"rule", "add", "test"', '"rule", "test", "add"'],
] as const

for (const file of files) {
  if (selected.length > 0 && !selected.includes(file)) {
    continue
  }

  const path = resolve(root, file)
  const content = readFileSync(path, "utf8")

  const moved = replacements.reduce(
    (text, [before, after]) => text.replaceAll(before, after),
    content
  )

  if (content === moved) {
    continue
  }

  if (write) {
    writeFileSync(path, moved)
  }

  console.info(`${write ? "Updated" : "Would update"} ${file}`)
}
