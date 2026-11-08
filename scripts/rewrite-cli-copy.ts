import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"
import * as Array from "effect/Array"
import * as Predicate from "effect/Predicate"
import { parseSync, Visitor } from "oxc-parser"
import changes from "./cli-copy.json" with { type: "json" }

// Inventory authored CLI text with --inventory. Apply the reviewed replacements with --write.
// With no flags, print the before-and-after table. Optional paths limit a write to those files.
const root = resolve(import.meta.dirname, "..")
const selected = process.argv.slice(2).filter((argument) => !argument.startsWith("--"))

if (process.argv.includes("--inventory")) {
  const files = execFileSync("git", ["ls-files", "src", "presets/rules", "presets/lint/plugin"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((file) => file.endsWith(".ts") && !file.includes("/__tests__/"))
  const inventory: Array<{ file: string; line: number; source: string }> = []

  for (const file of files) {
    const source = readFileSync(resolve(root, file), "utf8")
    const parsed = parseSync(file, source, { sourceType: "module" })

    if (parsed.errors.length > 0) {
      throw new Error(`Cannot inventory ${file}: the source does not parse.`)
    }

    new Visitor({
      Literal(node) {
        if (Predicate.isString(node.value) && /[A-Z\s]/.test(node.value)) {
          inventory.push({
            file,
            line: source.slice(0, node.start).split("\n").length,
            source: source.slice(node.start, node.end),
          })
        }
      },
      TemplateLiteral(node) {
        const text = source.slice(node.start, node.end)

        if (/[a-z]+\s+[a-z]+/i.test(text)) {
          inventory.push({
            file,
            line: source.slice(0, node.start).split("\n").length,
            source: text,
          })
        }
      },
    }).visit(parsed.program)
  }

  console.info(JSON.stringify(inventory, null, 2))
} else if (process.argv.includes("--write")) {
  for (const [file, replacements] of Object.entries(
    Array.groupBy(changes, (change) => change.file)
  )) {
    if (selected.length > 0 && !selected.includes(file)) {
      continue
    }

    const path = resolve(root, file)
    const source = readFileSync(path, "utf8")
    let updated = source

    for (const { before, after } of replacements) {
      if (updated.includes(before)) {
        updated = updated.replaceAll(before, after)
      } else if (!updated.includes(after)) {
        throw new Error(`Neither version of a copy change exists in ${file}: ${before}`)
      }
    }

    if (
      file.endsWith(".ts")
      && parseSync(file, updated, { sourceType: "module" }).errors.length > 0
    ) {
      throw new Error(`The copy changes make ${file} invalid TypeScript.`)
    }

    if (updated !== source) {
      writeFileSync(path, updated)
      console.info(`Updated ${file}`)
    }
  }
} else {
  console.info("| File | Before | After |")
  console.info("| --- | --- | --- |")

  for (const change of changes) {
    if (change.report === false) {
      continue
    }

    console.info(
      `| ${change.file} | ${formatCell(change.copyBefore ?? change.before)} | ${formatCell(change.copyAfter ?? change.after)} |`
    )
  }
}

function formatCell(source: string): string {
  const decoded: unknown =
    source.startsWith('"') && source.endsWith('"')
      ? JSON.parse(source)
      : source.startsWith("`") && source.endsWith("`")
        ? source.slice(1, -1).replaceAll("\\`", "`").replaceAll("\\n", "\n")
        : source
  const text = Predicate.isString(decoded) ? decoded : source

  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>")
}
