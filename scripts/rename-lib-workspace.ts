import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

// Rename `src/lib/workspace/` to `src/lib/project/`. The folder reads the target project, and
// "workspace" names a monorepo workspace. The script moves the folder with `git mv`, then points the
// `#lib/workspace/` imports, the `src/lib/workspace` paths, and the layer map at the new folder.
// Relative imports need no change: every file of the folder moves, and the new folder sits at the
// same depth. Preview with `node scripts/rename-lib-workspace.ts`. Apply with `--write`.
//
// The prose that names the layer, such as "`workspace` and `execution` do not import each other"
// in docs/architecture.md, needs a sentence change, so change it by hand after the script.
const root = path.resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")

const FROM = "src/lib/workspace"
const TO = "src/lib/project"

// A path ends before a separator, a quote, a backtick, a closing parenthesis, or white space.
const END = String.raw`(?=[/"'\`)\s]|$)`

const REPLACEMENTS: ReadonlyArray<readonly [pattern: RegExp, replacement: string]> = [
  [/#lib\/workspace\//g, "#lib/project/"],
  [new RegExp(String.raw`src/lib/workspace${END}`, "g"), TO],
]

// The layer map names the folder as a layer, and `sort-keys` wants the new key after
// `integrations`. `integrations/workspace/` is another folder and stays.
const LAYER_MAP: ReadonlyArray<readonly [pattern: RegExp, replacement: string]> = [
  [/^ +workspace: \{ imports: \["shared"\] \},\n/gm, ""],
  [
    /^( +)integrations: \{ imports: \["workspace", "execution"\] \},$/gm,
    '$1integrations: { imports: ["execution", "project"] },\n$1project: { imports: ["shared"] },',
  ],
]

// The RuleTester tests, the preset tests, and their fixtures name `src/lib/workspace` as a made-up
// path of a model project. The other scripts are codemods of earlier moves, and released history
// keeps its paths.
function checkIsKept(file: string) {
  return (
    file.startsWith("presets/")
    || file.startsWith("src/__tests__/presets/fixtures/")
    || file.startsWith("scripts/")
    || file.startsWith(".changeset/")
    || file === "CHANGELOG.md"
  )
}

const TEXT_EXTENSIONS = new Set([".json", ".md", ".ts", ".yaml", ".yml"])

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((file) => file !== "" && existsSync(path.join(root, file)))

function rename(file: string) {
  return file.startsWith(`${FROM}/`) ? `${TO}${file.slice(FROM.length)}` : file
}

// Read each file at its old path before the folder moves.
const rewrites = tracked
  .filter((file) => !checkIsKept(file) && TEXT_EXTENSIONS.has(path.extname(file)))
  .flatMap((file) => {
    const content = readFileSync(path.join(root, file), "utf8")
    const patterns = file === "oxlint.config.ts" ? [...REPLACEMENTS, ...LAYER_MAP] : REPLACEMENTS

    const renamed = patterns.reduce(
      (text, [pattern, replacement]) => text.replaceAll(pattern, replacement),
      content
    )

    return renamed === content ? [] : [{ content: renamed, file: rename(file) }]
  })

if (tracked.some((file) => file.startsWith(`${FROM}/`))) {
  if (write) {
    execFileSync("git", ["mv", FROM, TO], { cwd: root })
  }

  console.info(`${write ? "Moved" : "Would move"} ${FROM} to ${TO}`)
}

for (const { content, file } of rewrites) {
  if (write) {
    writeFileSync(path.join(root, file), content)
  }

  console.info(`${write ? "Updated" : "Would update"} ${file}`)
}

// Oxfmt sorts the imports, and `#lib/project/` sorts before `#lib/shared/`.
if (write && rewrites.length > 0) {
  execFileSync("pnpm", ["exec", "oxfmt", ...rewrites.map(({ file }) => file)], {
    cwd: root,
    stdio: "inherit",
  })
}
