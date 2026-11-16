import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"

// Replay issue #888 from the repository root: an in-memory test that reads a project gets the
// in-memory `ConfigLoader` through `withConfigLoader`. Preview with
// `node scripts/provide-config-loader.ts`, or apply with `--write`. Optional file paths limit the
// run to the first hand-checked unit. Run Oxfmt on the files afterwards.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = process.argv.slice(2).filter((argument) => argument !== "--write")

const files = [
  "src/lib/assessment/__tests__/index.test.ts",
  "src/lib/integrations/oxfmt/__tests__/languages.test.ts",
  "src/lib/integrations/oxlint/__tests__/custom.test.ts",
  "src/lib/integrations/oxlint/__tests__/runtime-assessment.test.ts",
  "src/lib/integrations/oxlint/__tests__/tsrs.test.ts",
  "src/lib/integrations/oxlint/plugins/__tests__/tailwind.test.ts",
  "src/lib/integrations/oxlint/plugins/effect-tsgo/__tests__/index.test.ts",
  "src/lib/integrations/typescript/__tests__/assess.test.ts",
]

const PROVIDE = "Effect.provide(["

const BRACKET_DEPTH = new Map([
  ["[", 1],
  ["]", -1],
])

/**
 * Each `Effect.provide([...])` of a layer list that has a module resolver becomes
 * `Effect.provide(withConfigLoader(Layer.mergeAll(...)))`. The list ends at its matching bracket,
 * because a layer in it can hold a list of its own.
 */
function wrapProvides(source: string) {
  let next = ""
  let count = 0
  let from = 0

  for (let start = source.indexOf(PROVIDE); start !== -1; start = source.indexOf(PROVIDE, from)) {
    let depth = 1
    let end = start + PROVIDE.length

    while (depth > 0) {
      depth += BRACKET_DEPTH.get(source[end] ?? "") ?? 0
      end += 1
    }

    const layers = source.slice(start + PROVIDE.length, end - 1)
    next += source.slice(from, start)

    if (/makeModuleResolverLayer|resolverLayer/u.test(layers) && source[end] === ")") {
      count += 1
      next += `Effect.provide(withConfigLoader(Layer.mergeAll(${layers.trim().replace(/,$/u, "")})))`
      from = end + 1
    } else {
      next += source.slice(start, end)
      from = end
    }
  }

  return { count, next: next + source.slice(from) }
}

const IMPORT = 'import { withConfigLoader } from "#__tests__/config-loader.ts"\n'

for (const file of files) {
  if (selected.length > 0 && !selected.includes(file)) {
    continue
  }

  const path = resolve(root, file)
  const source = readFileSync(path, "utf8")
  const wrapped = wrapProvides(source)
  const { count } = wrapped
  let { next } = wrapped

  if (!next.includes(IMPORT)) {
    next = next.replace(
      /^import \{[^}]*\} from "#__tests__\/filesystem\.ts"\n/mu,
      (line) => IMPORT + line
    )
  }

  if (!/^import \* as Layer from "effect\/Layer"$/mu.test(next)) {
    next = next.replace(
      /^import \* as Effect from "effect\/Effect"\n/mu,
      (line) => `${line}import * as Layer from "effect/Layer"\n`
    )
  }

  console.info(`${file}: ${count}`)

  if (write) {
    writeFileSync(path, next)
  }
}
