import { readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import process from "node:process"
import * as Predicate from "effect/Predicate"

// Replay issue #888 from the repository root: each preset object names its public module under
// `PRESET` from `presets/identity.ts`. Preview with `node scripts/mark-presets.ts`, or apply with
// `--write`. Optional file paths limit the run to the first hand-checked unit.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = process.argv.slice(2).filter((argument) => argument !== "--write")

const packageJson: { readonly exports: Record<string, string | { readonly default: string }> } =
  JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))

// Each exported preset, as its source file and its public module, from the export map. The rules
// and the JSON presets are not config objects.
const presets = Object.entries(packageJson.exports).flatMap(([key, target]) => {
  const built = Predicate.isString(target) ? target : target.default
  const match = /^\.\/dist\/(presets\/(?:analyze|format|lint\/[\w-]+)\.)js$/u.exec(built)

  return match === null ? [] : [{ file: `${match[1]}ts`, module: `adamantite${key.slice(1)}` }]
})

const DECLARATION = /^const config: [^=]+= \{\n/mu

for (const { file, module } of presets) {
  if (selected.length > 0 && !selected.includes(file)) {
    continue
  }

  const path = resolve(root, file)
  const source = readFileSync(path, "utf8")
  const identity = relative(dirname(path), resolve(root, "presets/identity.ts"))
  const specifier = identity.startsWith(".") ? identity : `./${identity}`
  const declaration = DECLARATION.exec(source)

  if (declaration === null) {
    throw new Error(`${file} has no \`const config\` object.`)
  }

  const imports = [...source.matchAll(/^import .+\n/gmu)]
  const lastImport = imports.at(-1)

  if (lastImport === undefined) {
    throw new Error(`${file} has no import.`)
  }

  const importEnd = lastImport.index + lastImport[0].length
  const declarationEnd = declaration.index + declaration[0].length
  // `presets/tsconfig.json` is the published TypeScript preset, which allows a `.ts` import only for
  // types, so a preset beside it spells the key.
  const isRootPreset = dirname(path) === resolve(root, "presets")

  const next = [
    source.slice(0, importEnd),
    isRootPreset
      ? `import type { PresetIdentity } from "${specifier}"\n`
      : `import { PRESET, type PresetIdentity } from "${specifier}"\n`,
    source.slice(importEnd, declarationEnd),
    isRootPreset
      ? `  // The \`PRESET\` key of \`identity.ts\`, which \`presets/tsconfig.json\` cannot import here.\n  [Symbol.for("adamantite.preset")]: { module: "${module}" } satisfies PresetIdentity,\n`
      : `  [PRESET]: { module: "${module}" } satisfies PresetIdentity,\n`,
    source.slice(declarationEnd),
  ].join("")

  console.info(`${file}: ${module}`)

  if (write) {
    writeFileSync(path, next)
  }
}
