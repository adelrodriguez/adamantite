import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { promisify } from "node:util"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import { parseSync } from "oxc-parser"

// Copy the antislop-effect rules of the effect preset into the first-party plugin, from the
// upstream commit that the vendored bundle was built from. Preview with
// `node scripts/copy-antislop-effect-rules.ts`, or apply with `--write`. Optional rule names limit
// the run to the first hand-checked unit, such as `prefer-effect-match`.
//
// The script converts each rule as scripts/copy-antislop-rules.ts does: `defineRule({ ... })`
// becomes `const rule: Rule = { ... }` with a default export, so the plugin imports only types from
// `@oxlint/plugins`. It moves each upstream test to Vitest. Later commits change the copied code
// by hand, so run this script only at the commit that adds it.
const root = path.resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = new Set(process.argv.slice(2).filter((argument) => argument !== "--write"))

const REPO_URL = "https://github.com/dmmulroy/anti-slop.git"
const PINNED_REF = "13909c9e07590f5a85d93c62712259fe14a883f7"

// The vendored bundle applies this patch, so the copy applies it too, and the effect preset keeps
// its behavior.
const PATCHES = [
  "scripts/vendor-patches/antislop-effect/no-manual-tagged-construction-constructor-input.patch",
]

const SOURCE_DIR = "src/effect"
const PLUGIN_DIR = path.join(root, "presets/lint/plugins/antislop-effect")
const TEST_DIR = path.join(root, "src/__tests__/plugins/antislop-effect")
const PLUGIN_IMPORT = "#presets/lint/plugins/antislop-effect/index.ts"

const execFileAsync = promisify(execFile)

async function run(command: string, args: string[], cwd: string) {
  return execFileAsync(command, args, { cwd })
}

interface Edit {
  readonly end: number
  readonly start: number
  readonly text: string
}

// Apply edits from the end of the file, so each edit keeps the offsets of the edits before it.
const byStartDescending = Order.flip(Order.mapInput(Order.Number, (edit: Edit) => edit.start))

function applyEdits(source: string, edits: readonly Edit[]) {
  return EffectArray.sort(edits, byStartDescending).reduce(
    (text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end),
    source
  )
}

/**
 * Rewrite one rule module. `export const xRule = defineRule({ ... })` becomes `const rule: Rule = {
 * ... }` followed by `export default rule`, and every import from `@oxlint/plugins` becomes one
 * type import.
 */
function convertRule(file: string, source: string) {
  const { program } = parseSync(file, source)
  const edits: Edit[] = []
  const typeNames = new Set(["Rule"])
  let firstImport = true

  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration" && statement.source.value === "@oxlint/plugins") {
      for (const specifier of statement.specifiers) {
        if (specifier.type !== "ImportSpecifier" || specifier.imported.type !== "Identifier") {
          throw new Error(`${file}: unexpected @oxlint/plugins import`)
        }

        if (specifier.imported.name !== "defineRule") {
          typeNames.add(specifier.imported.name)
        }
      }

      edits.push({ end: statement.end, start: statement.start, text: firstImport ? "IMPORT" : "" })
      firstImport = false
      continue
    }

    if (
      statement.type !== "ExportNamedDeclaration"
      || statement.declaration?.type !== "VariableDeclaration"
    ) {
      continue
    }

    const init = statement.declaration.declarations[0]?.init

    if (
      init?.type !== "CallExpression"
      || init.callee.type !== "Identifier"
      || init.callee.name !== "defineRule"
      || init.arguments[0]?.type !== "ObjectExpression"
    ) {
      continue
    }

    const [value] = init.arguments

    edits.push({
      end: statement.end,
      start: statement.start,
      text: `const rule: Rule = ${source.slice(value.start, value.end)}\n\nexport default rule`,
    })
  }

  const ruleImport = `import type { ${EffectArray.sort(typeNames, Order.String).join(", ")} } from "@oxlint/plugins"`

  return applyEdits(source, edits).replace("IMPORT", ruleImport)
}

/**
 * Rewrite one upstream test for Vitest. The test reads its rule from the plugin, as the first-party
 * rule tests do.
 */
function convertTest(source: string) {
  const ruleImport = /^import \{ (\w+) \} from "\.\/([\w-]+)\.ts";\n/gmu

  const rules = [...source.matchAll(ruleImport)].map(([, local = "", name = ""]) => ({
    local,
    name,
  }))

  const header = `import { describe, it } from "vitest"
import plugin from "${PLUGIN_IMPORT}"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only
`

  return rules
    .reduce(
      (text, { local, name }) =>
        text.replaceAll(new RegExp(`\\b${local}\\b`, "gu"), `plugin.rules["${name}"]`),
      source.replaceAll(ruleImport, "")
    )
    .replace(/^(import \{ RuleTester \} from "oxlint\/plugins-dev";\n)/mu, `$1${header}`)
}

async function readFolder(directory: string) {
  const files = EffectArray.sort(await readdir(directory), Order.String)

  return Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(path.join(directory, file), "utf8"),
    }))
  )
}

async function copyUpstream(cloneDir: string) {
  const output = new Map<string, string>()

  for (const { file, source } of await readFolder(path.join(cloneDir, SOURCE_DIR, "rules"))) {
    const name = file.replace(/(?:\.test)?\.ts$/u, "")

    if (selected.size > 0 && !selected.has(name)) {
      continue
    }

    if (file.endsWith(".test.ts")) {
      output.set(path.join(TEST_DIR, file), convertTest(source))
    } else {
      output.set(path.join(PLUGIN_DIR, "rules", file), convertRule(file, source))
    }
  }

  if (selected.size > 0) {
    return output
  }

  for (const { file, source } of await readFolder(path.join(cloneDir, SOURCE_DIR, "shared"))) {
    output.set(path.join(PLUGIN_DIR, "shared", file), source)
  }

  const license = await readFile(path.join(cloneDir, "LICENSE"), "utf8")
  const { stdout } = await run("git", ["rev-parse", "HEAD"], cloneDir)

  output.set(
    path.join(PLUGIN_DIR, "license.md"),
    `# antislop-effect license

The rules in this folder started as a copy of the Effect rules of
[anti-slop](https://github.com/dmmulroy/anti-slop) at commit ${stdout.trim()}. Adamantite changes
them as its own code.

${license}`
  )

  return output
}

const cloneDir = await mkdtemp(path.join(tmpdir(), "antislop-effect-"))

try {
  await run("git", ["clone", "--quiet", REPO_URL, "."], cloneDir)
  await run("git", ["checkout", "--quiet", PINNED_REF], cloneDir)
  await run("git", ["apply", ...PATCHES.map((patch) => path.join(root, patch))], cloneDir)

  const output = await copyUpstream(cloneDir)

  if (write) {
    await Promise.all(
      [...output].map(async ([file, content]) => {
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, content)
      })
    )

    await run("node_modules/.bin/oxfmt", [...output.keys()], root)
  }

  for (const file of output.keys()) {
    console.info(`${write ? "wrote" : "would write"} ${path.relative(root, file)}`)
  }
} finally {
  await rm(cloneDir, { force: true, recursive: true })
}
