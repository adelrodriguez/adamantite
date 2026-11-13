import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { promisify } from "node:util"
import { parseSync } from "oxc-parser"

// Copy the anti-slop rules of the strict preset into the first-party plugin, from the upstream
// commit that the vendored bundle was built from. Preview with
// `node scripts/copy-anti-slop-rules.ts`, or apply with `--write`. Optional rule names limit the
// run to the first hand-checked unit, such as `no-reflect-get`.
//
// The script converts each rule from `defineRule({ ... })` to the first-party form,
// `const rule: Rule = { ... }` with a default export, so the plugin imports only types from
// `@oxlint/plugins`. It moves each upstream test to Vitest. Later commits change the copied code
// by hand, so run this script only at the commit that adds it.
const root = path.resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = new Set(process.argv.slice(2).filter((argument) => argument !== "--write"))

const REPO_URL = "https://github.com/dmmulroy/anti-slop.git"
const PINNED_REF = "13909c9e07590f5a85d93c62712259fe14a883f7"

// The vendored bundle applies this patch, so the copy applies it too, and the strict preset keeps
// its behavior.
const PATCHES = ["scripts/vendor-patches/anti-slop/no-unknown-parameters-rejection-callback.patch"]

const PLUGIN_DIR = path.join(root, "presets/lint/plugin/antislop")
const TEST_DIR = path.join(root, "src/__tests__/plugin/antislop")
const PLUGIN_IMPORT = "#presets/lint/plugin/antislop/index.ts"
const STYLISTIC_IMPORT = "#presets/lint/plugin/antislop/stylistic/"

// Upstream's process test runs `oxlint --fix` in a temporary folder. It moves by hand to the
// preset tests, which run real processes.
const SKIPPED_TESTS = new Set(["require-readable-spacing-cli.test.ts"])

const execFileAsync = promisify(execFile)

async function run(command: string, args: string[], cwd: string) {
  return execFileAsync(command, args, { cwd })
}

interface Edit {
  readonly end: number
  readonly start: number
  readonly text: string
}

function applyEdits(source: string, edits: readonly Edit[]) {
  return edits
    .toSorted((left, right) => right.start - left.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)
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

        if (!["CreateRule", "defineRule"].includes(specifier.imported.name)) {
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

    const value =
      init?.type === "CallExpression"
      && init.callee.type === "Identifier"
      && init.callee.name === "defineRule"
        ? init.arguments[0]
        : init

    if (value?.type !== "ObjectExpression") {
      continue
    }

    edits.push({
      end: statement.end,
      start: statement.start,
      text: `const rule: Rule = ${source.slice(value.start, value.end)}\n\nexport default rule`,
    })
  }

  const ruleImport = `import type { ${[...typeNames].toSorted().join(", ")} } from "@oxlint/plugins"`

  return applyEdits(source, edits)
    .replace("IMPORT", ruleImport)
    .replaceAll("../vendor/eslint-stylistic/", "../stylistic/")
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
    .replaceAll('tester.run("anti-slop/', 'tester.run("')
    .replaceAll("../vendor/eslint-stylistic/", STYLISTIC_IMPORT)
    .replaceAll("padding-line-options.d.ts", "padding-line-options.ts")
}

async function listFiles(directory: string) {
  const entries = await readdir(directory)

  return entries.toSorted()
}

async function copyUpstream(cloneDir: string) {
  const output = new Map<string, string>()
  const rulesDir = path.join(cloneDir, "src/rules")

  for (const file of await listFiles(rulesDir)) {
    const name = file.replace(/(?:\.test)?\.ts$/u, "")

    if (selected.size > 0 && !selected.has(name)) {
      continue
    }

    const source = await readFile(path.join(rulesDir, file), "utf8")

    if (file.endsWith(".test.ts")) {
      if (!SKIPPED_TESTS.has(file)) {
        output.set(path.join(TEST_DIR, file), convertTest(source))
      }

      continue
    }

    output.set(path.join(PLUGIN_DIR, "rules", file), convertRule(file, source))
  }

  if (selected.size > 0) {
    return output
  }

  const sharedDir = path.join(cloneDir, "src/shared")

  for (const file of await listFiles(sharedDir)) {
    output.set(
      path.join(PLUGIN_DIR, "shared", file),
      await readFile(path.join(sharedDir, file), "utf8")
    )
  }

  // The options module is only types, so it becomes a `.ts` module that the build emits with the
  // rule that imports it.
  const stylisticDir = path.join(cloneDir, "src/vendor/eslint-stylistic")

  for (const file of await listFiles(stylisticDir)) {
    const source = await readFile(path.join(stylisticDir, file), "utf8")
    const target = file === "LICENSE" ? "license.md" : file.replace(/\.d\.ts$/u, ".ts")

    output.set(
      path.join(PLUGIN_DIR, "stylistic", target),
      source.replaceAll("padding-line-options.d.ts", "padding-line-options.ts")
    )
  }

  const license = await readFile(path.join(cloneDir, "LICENSE"), "utf8")
  const { stdout } = await run("git", ["rev-parse", "HEAD"], cloneDir)

  output.set(
    path.join(PLUGIN_DIR, "license.md"),
    `# anti-slop license

The rules in this folder started as a copy of
[anti-slop](https://github.com/dmmulroy/anti-slop) at commit ${stdout.trim()}. Adamantite changes
them as its own code. The \`stylistic\` folder holds code that anti-slop copied from ESLint
Stylistic, with its own license.

${license}`
  )

  return output
}

const cloneDir = await mkdtemp(path.join(tmpdir(), "anti-slop-"))

try {
  await run("git", ["clone", "--quiet", REPO_URL, "."], cloneDir)
  await run("git", ["checkout", "--quiet", PINNED_REF], cloneDir)
  await run("git", ["apply", ...PATCHES.map((patch) => path.join(root, patch))], cloneDir)

  const output = await copyUpstream(cloneDir)

  for (const [file, content] of output) {
    if (write) {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    }

    console.info(`${write ? "wrote" : "would write"} ${path.relative(root, file)}`)
  }

  if (write) {
    await run("node_modules/.bin/oxfmt", [...output.keys()], root)
  }
} finally {
  await rm(cloneDir, { force: true, recursive: true })
}
