import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { posix, resolve } from "node:path"
import process from "node:process"

// Give each first-party plugin its own folder below `presets/lint/plugins/`, with the rule
// namespace as the folder name, and move the RuleTester tests the same way. Each step moves the
// files with `git mv`, and points the relative imports and the path strings at the new paths.
// Preview a step with `node scripts/move-first-party-plugins.ts <step>`, or apply it with
// `--write`. Run the steps in the order of `STEPS`, and commit after each one.
//
// The script does not change the layer map keys in oxlint.config.ts or the prose in the docs.
// Change them by hand in the same commit.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const stepName = process.argv.slice(2).find((argument) => argument !== "--write")

type Move = readonly [from: string, to: string]

const PLUGINS = "presets/lint/plugins"
const TESTS = "src/__tests__/plugins"

// A move names a folder, or a file with its `.ts` extension. The first step was made by hand, and
// a run of this script on the commit before it writes the same files.
const STEPS: ReadonlyMap<string, readonly Move[]> = new Map([
  [
    "anti-slop-effect",
    [
      ["presets/lint/plugin/antislop-effect", "presets/lint/plugin/anti-slop-effect"],
      ["src/__tests__/plugin/antislop-effect", "src/__tests__/plugin/anti-slop-effect"],
    ],
  ],
  [
    "anti-slop",
    [
      ["presets/lint/plugin/antislop", "presets/lint/plugin/anti-slop"],
      ["src/__tests__/plugin/antislop", "src/__tests__/plugin/anti-slop"],
    ],
  ],
  [
    "container",
    [
      ["presets/lint/plugin", PLUGINS],
      ["src/__tests__/plugin", TESTS],
    ],
  ],
  // The adamantite plugin leaves the container root. The helpers that only its rules import go
  // with it, and `ast.ts` and `options.ts` stay in the `shared` folder of all plugins.
  [
    "adamantite",
    [
      [`${PLUGINS}/index.ts`, `${PLUGINS}/adamantite/index.ts`],
      [`${PLUGINS}/rules`, `${PLUGINS}/adamantite/rules`],
      [`${PLUGINS}/shared/glob.ts`, `${PLUGINS}/adamantite/shared/glob.ts`],
      [`${PLUGINS}/shared/imports.ts`, `${PLUGINS}/adamantite/shared/imports.ts`],
      [`${PLUGINS}/shared/resolver.ts`, `${PLUGINS}/adamantite/shared/resolver.ts`],
      [`${TESTS}/ast.test.ts`, `${TESTS}/shared/ast.test.ts`],
      [`${TESTS}/glob.test.ts`, `${TESTS}/adamantite/glob.test.ts`],
      [`${TESTS}/import-owners.test.ts`, `${TESTS}/adamantite/import-owners.test.ts`],
      [`${TESTS}/layers-nested.test.ts`, `${TESTS}/adamantite/layers-nested.test.ts`],
      [`${TESTS}/layers.test.ts`, `${TESTS}/adamantite/layers.test.ts`],
      [
        `${TESTS}/no-overzealous-destructuring.test.ts`,
        `${TESTS}/adamantite/no-overzealous-destructuring.test.ts`,
      ],
      [
        `${TESTS}/no-query-data-in-state.test.ts`,
        `${TESTS}/adamantite/no-query-data-in-state.test.ts`,
      ],
      [`${TESTS}/no-react-state-hooks.test.ts`, `${TESTS}/adamantite/no-react-state-hooks.test.ts`],
      [`${TESTS}/query-from-loader.test.ts`, `${TESTS}/adamantite/query-from-loader.test.ts`],
      [
        `${TESTS}/require-suppression-reason.test.ts`,
        `${TESTS}/adamantite/require-suppression-reason.test.ts`,
      ],
    ],
  ],
])

const moves = stepName === undefined ? undefined : STEPS.get(stepName)

if (moves === undefined) {
  throw new Error(`Name one step: ${[...STEPS.keys()].join(", ")}`)
}

// Files outside `presets/` and `src/` that name a plugin path.
const OTHER_FILES = new Set([
  ".github/workflows/test.yml",
  "CONTRIBUTING.md",
  "oxlint.config.ts",
  "scripts/test-smoke.ts",
  "tsdown.config.ts",
])

const FIXTURES = "src/__tests__/presets/fixtures/"

function movePath(path: string): string {
  for (const [from, to] of moves ?? []) {
    if (path === from) return to

    if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`
  }

  return path
}

/**
 * Point each relative import of a file at the new path of its target, from the new path of the
 * file.
 */
function moveRelativeImports(file: string, content: string): string {
  return content.replaceAll(
    /(?<head>\bfrom\s+|\bimport\s*\(\s*|^import\s+)"(?<specifier>\.{1,2}\/[^"]+)"/gm,
    (match, head: string, specifier: string) => {
      const target = posix.join(posix.dirname(file), specifier)

      if (movePath(file) === file && movePath(target) === target) return match

      const moved = posix.relative(posix.dirname(movePath(file)), movePath(target))

      return `${head}"${moved.startsWith("../") ? moved : `./${moved}`}"`
    }
  )
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

/**
 * The forms that name a moved path in a file: the path from the repository root, which a `#presets`
 * import also contains, the package subpath `adamantite/lint/...` of the built module, and, in a
 * preset, the path from the preset's folder.
 */
function listPathForms(file: string, [from, to]: Move): Move[] {
  const forms: Move[] = [[from, to]]

  if (from.startsWith("presets/")) {
    forms.push([from.replace("presets/", "adamantite/"), to.replace("presets/", "adamantite/")])
  }

  if (posix.dirname(file) === "presets/lint" && from.startsWith("presets/lint/")) {
    forms.push([from.slice("presets/lint/".length), to.slice("presets/lint/".length)])
  }

  return forms
}

/**
 * Replace each path string that names a moved file or folder. A file form matches without its
 * extension, because a preset and the smoke test name a module without `.ts`. A folder form matches
 * only before a path separator when it has one segment, such as `plugin` in a preset, because the
 * same word occurs in prose.
 */
function movePathStrings(file: string, content: string): string {
  let moved = content

  for (const move of moves ?? []) {
    for (const [from, to] of listPathForms(file, move)) {
      const pattern = from.endsWith(".ts")
        ? new RegExp(`${escapeRegExp(from.slice(0, -3))}(?=[."'\`])`, "g")
        : new RegExp(`${escapeRegExp(from)}(?=${from.includes("/") ? "[/\\s\"'`]" : "/"})`, "g")

      moved = moved.replaceAll(pattern, to.endsWith(".ts") ? to.slice(0, -3) : to)
    }
  }

  return moved
}

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((file) => file !== "")

const textFiles = tracked.filter(
  (file) =>
    OTHER_FILES.has(file)
    || ((file.startsWith("presets/") || file.startsWith("src/"))
      && (file.endsWith(".ts") || file.endsWith(".md"))
      && !file.startsWith(FIXTURES))
)

// Read each file at its old path before any file moves.
const rewrites = textFiles.flatMap((file) => {
  const content = readFileSync(resolve(root, file), "utf8")

  const moved = movePathStrings(
    file,
    file.endsWith(".ts") ? moveRelativeImports(file, content) : content
  )

  return moved === content ? [] : [{ content: moved, file }]
})

for (const file of tracked) {
  const target = movePath(file)

  if (target !== file) {
    if (write) {
      mkdirSync(resolve(root, posix.dirname(target)), { recursive: true })
      execFileSync("git", ["mv", file, target], { cwd: root })
    }

    console.info(`${write ? "Moved" : "Would move"} ${file} to ${target}`)
  }
}

for (const { content, file } of rewrites) {
  if (write) {
    writeFileSync(resolve(root, movePath(file)), content)
  }

  console.info(`${write ? "Updated" : "Would update"} ${movePath(file)}`)
}
