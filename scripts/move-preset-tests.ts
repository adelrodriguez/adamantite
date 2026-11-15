import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { posix, resolve } from "node:path"
import process from "node:process"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import { parseSync, type ValueSpan } from "oxc-parser"

// Move the tests of the presets, the first-party rules, and custom() from `src/__tests__/` to
// `presets/`, next to the code that they test. Each unit moves its files with `git mv`, points the
// relative imports, the `#` imports, and the `import.meta.dirname` paths at the new paths, and
// replaces the old paths in the docs and configs. Preview a unit with
// `node scripts/move-preset-tests.ts <unit>`, or apply it with `--write`. Run the units in the order
// of `UNITS`, and commit after each one.
//
// The script does not change the Vitest projects, the build, or the lint config beyond their paths.
// Change them by hand after the last unit.
//
// The rule fixtures stay in `src/__tests__/presets/fixtures`. Below `presets/`, the published
// `presets/tsconfig.json` would include them, and the Oxlint type check of `presets/analyze.ts`
// reports each file of that project, also a file that `ignorePatterns` ignores.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const unitName = process.argv.slice(2).find((argument) => argument !== "--write")

type Move = readonly [from: string, to: string]

interface Unit {
  /**
   * The files and folders that move. A move names a folder, or a file with its extension.
   */
  readonly moves: readonly Move[]
  /**
   * Each pattern that names an old path in a doc or config, and its replacement.
   */
  readonly paths: ReadonlyArray<readonly [pattern: RegExp, replacement: string]>
  /**
   * The files and folders below a moved folder that stay where they are.
   */
  readonly stays?: readonly string[]
  /**
   * The ignored folders below a moved folder that a tool generates, such as an install. The script
   * deletes them, and the tool writes them again at the new path.
   */
  readonly generated?: readonly string[]
}

const TESTS = "src/__tests__"
const PLUGINS = "presets/lint/plugins"
const PLUGIN_FOLDERS = ["adamantite", "antislop", "antislop-effect", "shared"] as const

// A path ends before a separator, a quote, a backtick, a closing parenthesis, or white space.
const END = String.raw`(?=[/"'\`)\s]|$)`

// The first unit was made by hand, and a run of this script on the commit before it writes the
// same files.
const UNITS: ReadonlyMap<string, Unit> = new Map([
  [
    "plugins",
    {
      moves: [
        [`${TESTS}/plugins/entry.test.ts`, `${PLUGINS}/__tests__/entry.test.ts`],
        ...PLUGIN_FOLDERS.map((plugin): Move => [
          `${TESTS}/plugins/${plugin}`,
          `${PLUGINS}/${plugin}/__tests__`,
        ]),
      ],
      paths: [
        [/src\/__tests__\/plugins\/entry\.test\.ts/g, `${PLUGINS}/__tests__/entry.test.ts`],
        // A doc names a test with placeholders, such as `<namespace>/<rule>.test.ts`.
        [/src\/__tests__\/plugins\/([^/"'`\s]+)\//g, `${PLUGINS}/$1/__tests__/`],
        // Vitest filters by path, so the plugins folder also selects the entry test.
        [new RegExp(String.raw`src/__tests__/plugins${END}`, "g"), PLUGINS],
      ],
    },
  ],
  [
    "custom",
    {
      moves: [[`${TESTS}/custom`, "presets/rules/__tests__"]],
      paths: [[new RegExp(String.raw`src/__tests__/custom${END}`, "g"), "presets/rules/__tests__"]],
    },
  ],
  [
    "presets",
    {
      // The Vitest `globalSetup` of the presets project installs the fixture packages again.
      generated: [`${TESTS}/presets/fixture-packages/node_modules`],
      moves: [[`${TESTS}/presets`, "presets/__tests__"]],
      paths: [
        [
          new RegExp(String.raw`src/__tests__/presets(?!/fixtures\b)${END}`, "g"),
          "presets/__tests__",
        ],
      ],
      stays: [`${TESTS}/presets/fixtures`],
    },
  ],
])

const unit = unitName === undefined ? undefined : UNITS.get(unitName)

if (unit === undefined) {
  throw new Error(`Name one unit: ${[...UNITS.keys()].join(", ")}`)
}

const { generated = [], moves, paths, stays = [] } = unit

// Fixtures are lint input, so their text stays as it is. The other scripts are codemods of earlier
// moves, and released history keeps its paths.
function checkIsKept(file: string) {
  return (
    file.startsWith(`${TESTS}/presets/fixtures/`)
    || file.startsWith("scripts/")
    || file.startsWith(".changeset/")
    || file === "CHANGELOG.md"
  )
}

const TEXT_EXTENSIONS = new Set([".json", ".md", ".ts", ".yaml", ".yml"])

function movePath(path: string): string {
  if (stays.some((stay) => path === stay || path.startsWith(`${stay}/`))) {
    return path
  }

  for (const [from, to] of moves) {
    if (path === from) return to

    if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`
  }

  return path
}

/**
 * The path from the folder of `file` to `target`, as a relative specifier.
 */
function toRelative(file: string, target: string): string {
  const relative = posix.relative(posix.dirname(file), target)

  return relative.startsWith("../") ? relative : `./${relative}`
}

/**
 * The new text of a relative path that `file` names, from the new path of `file` to the new path of
 * the target. Undefined when neither moves.
 */
function moveRelative(file: string, value: string): string | undefined {
  const target = posix.join(posix.dirname(file), value)

  if (movePath(file) === file && movePath(target) === target) {
    return undefined
  }

  const moved = toRelative(movePath(file), movePath(target))

  // A path to a folder, such as `../../..`, keeps the form without `./`.
  return value.startsWith("./") || !moved.startsWith("./") ? moved : moved.slice(2)
}

/**
 * The new text of a `#` import. `#presets/*` names `presets/*`, and `#*` names `src/*`.
 */
function moveAlias(value: string): string | undefined {
  const path = value.startsWith("#presets/") ? value.slice(1) : `src/${value.slice(1)}`
  const moved = movePath(path)

  if (moved === path) {
    return undefined
  }

  return moved.startsWith("presets/") ? `#${moved}` : `#${moved.slice("src/".length)}`
}

const FROM_THE_END = Order.flip(Order.mapInput(Order.Number, (request: ValueSpan) => request.start))

/**
 * Point each relative and `#` import and re-export of a file at the new path of its target. The
 * parser finds the module requests, so an import in the code of a test case, such as `import { run
 * } from "../execution/run.ts"` in a RuleTester test, stays as it is.
 */
function moveImports(file: string, content: string): string {
  const { module } = parseSync(file, content)

  const requests = [
    ...module.staticImports.map((entry) => entry.moduleRequest),
    ...module.staticExports.flatMap((entry) =>
      entry.entries.flatMap((item) => item.moduleRequest ?? [])
    ),
  ]

  let moved = content

  // Replace from the end, so the earlier offsets stay correct.
  for (const request of EffectArray.sort(requests, FROM_THE_END)) {
    const specifier = request.value.startsWith(".")
      ? moveRelative(file, request.value)
      : request.value.startsWith("#")
        ? moveAlias(request.value)
        : undefined

    if (specifier !== undefined) {
      moved = `${moved.slice(0, request.start)}"${specifier}"${moved.slice(request.end)}`
    }
  }

  return moved
}

/**
 * Point each path that a test builds from its own folder, such as `join(import.meta.dirname,
 * "../../..")`, at the new path of its target.
 */
function moveDirnamePaths(file: string, content: string): string {
  return content.replaceAll(
    /(import\.meta\.dirname,\s*)"([^"]+)"/g,
    (match, prefix: string, value: string) => {
      const moved = moveRelative(file, value)

      return moved === undefined ? match : `${prefix}"${moved}"`
    }
  )
}

function movePathStrings(content: string): string {
  return paths.reduce(
    (text, [pattern, replacement]) => text.replaceAll(pattern, replacement),
    content
  )
}

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((file) => file !== "")

const textFiles = tracked.filter(
  (file) =>
    !checkIsKept(file)
    && TEXT_EXTENSIONS.has(posix.extname(file))
    && existsSync(resolve(root, file))
)

/**
 * Remove a folder that a move left empty, and each parent folder that it leaves empty.
 */
function removeEmptyFolders(folder: string) {
  for (
    let current = folder;
    current !== "."
    && existsSync(resolve(root, current))
    && readdirSync(resolve(root, current)).length === 0;
    current = posix.dirname(current)
  ) {
    rmdirSync(resolve(root, current))
  }
}

/**
 * Delete a generated folder that a move left behind. A folder that Git does not ignore stays, and
 * the script names it.
 */
function removeGenerated(folder: string) {
  if (!existsSync(resolve(root, folder))) {
    return
  }

  if (spawnSync("git", ["check-ignore", "--quiet", folder], { cwd: root }).status !== 0) {
    console.info(`Kept ${folder}, which Git does not ignore`)

    return
  }

  rmSync(resolve(root, folder), { force: true, recursive: true })
  removeEmptyFolders(posix.dirname(folder))
}

// Read each file at its old path before any file moves.
const rewrites = textFiles.flatMap((file) => {
  const content = readFileSync(resolve(root, file), "utf8")

  const imports = file.endsWith(".ts")
    ? moveDirnamePaths(file, moveImports(file, content))
    : content

  const moved = movePathStrings(imports)

  return moved === content ? [] : [{ content: moved, file }]
})

for (const file of tracked) {
  const target = movePath(file)

  if (target !== file) {
    if (write) {
      mkdirSync(resolve(root, posix.dirname(target)), { recursive: true })
      execFileSync("git", ["mv", file, target], { cwd: root })
      removeEmptyFolders(posix.dirname(file))
    }

    console.info(`${write ? "Moved" : "Would move"} ${file} to ${target}`)
  }
}

if (write) {
  for (const folder of generated) {
    removeGenerated(folder)
  }
}

for (const { content, file } of rewrites) {
  if (write) {
    writeFileSync(resolve(root, movePath(file)), content)
  }

  console.info(`${write ? "Updated" : "Would update"} ${movePath(file)}`)
}
