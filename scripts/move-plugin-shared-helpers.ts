import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import process from "node:process"

// Point the importers of the plugin-wide helpers at `presets/lint/plugin/shared/`. Run it after
// `git mv` moves options.ts, imports.ts, glob.ts, and resolver.ts into that folder. Preview with
// `node scripts/move-plugin-shared-helpers.ts`, or apply with `--write`. Optional file paths limit
// the run to the first hand-checked unit.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = process.argv.slice(2).filter((argument) => argument !== "--write")

const MODULES = ["glob", "imports", "options", "resolver"] as const
const PLUGIN = "presets/lint/plugin"

// A rule of the adamantite plugin imports `../<module>.ts`, a rule of the anti-slop plugins
// imports `../../<module>.ts`, a test imports `#presets/lint/plugin/<module>.ts`, and the
// `adamantite/import-owners` options in oxlint.config.ts name `presets/lint/plugin/<module>.ts`.
const replacements = MODULES.flatMap((module): Array<readonly [string, string]> => [
  [`"../${module}.ts"`, `"../shared/${module}.ts"`],
  [`"../../${module}.ts"`, `"../../shared/${module}.ts"`],
  [`"#${PLUGIN}/${module}.ts"`, `"#${PLUGIN}/shared/${module}.ts"`],
  [`"${PLUGIN}/${module}.ts"`, `"${PLUGIN}/shared/${module}.ts"`],
])

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) return listTypeScriptFiles(path)

    return entry.name.endsWith(".ts") ? [path] : []
  })
}

// The moved modules sit in `shared/` together, so their imports of each other do not change.
const files = [
  ...listTypeScriptFiles(join(root, PLUGIN)).filter(
    (path) => !path.startsWith(join(root, PLUGIN, "shared"))
  ),
  ...listTypeScriptFiles(join(root, "src/__tests__")),
  join(root, "oxlint.config.ts"),
].map((path) => relative(root, path))

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
