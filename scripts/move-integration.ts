import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

// Move one integration into its own folder in `src/lib/integrations/`, as issue #883 does for each
// integration. The script moves the file or folder with `git mv`, then points every `#lib/...`
// import and every `src/lib/...` path in the tracked text files at the new place. Preview with
// `node scripts/move-integration.ts <from> <to>`, from `src/lib/integrations/`, such as
// `tooling/oxfmt oxfmt` or `editors/zed.ts zed/index.ts`. Apply with `--write`.
//
// Relative imports, such as `../oxfmt/index.ts?raw`, and the prose that names the old folder
// change by hand after the script, and so does the integration code itself.
const root = path.resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const [from, to] = process.argv.slice(2).filter((argument) => argument !== "--write")

if (from === undefined || to === undefined) {
  throw new Error("Usage: node scripts/move-integration.ts <from> <to> [--write]")
}

const FROM = `src/lib/integrations/${from}`
const TO = `src/lib/integrations/${to}`

// A path ends before a separator, a quote, a backtick, a closing parenthesis, or white space.
const END = String.raw`(?=[/"'\`)\s]|$)`

function escape(text: string) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

const REPLACEMENTS: ReadonlyArray<readonly [pattern: RegExp, replacement: string]> = [
  [new RegExp(`#lib/integrations/${escape(from)}${END}`, "g"), `#lib/integrations/${to}`],
  [new RegExp(`${escape(FROM)}${END}`, "g"), TO],
]

// The codemods of earlier moves keep their paths, and so does released history. The rule fixtures
// model other projects, whose paths only look like the ones of this repository.
function checkIsKept(file: string) {
  return (
    (file.startsWith("scripts/") && !file.startsWith("scripts/test-"))
    || file.startsWith(".changeset/")
    || file.startsWith("src/__tests__/presets/fixtures/")
    || file === "CHANGELOG.md"
  )
}

const TEXT_EXTENSIONS = new Set([".json", ".md", ".ts", ".yaml", ".yml"])

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((file) => file !== "" && existsSync(path.join(root, file)))

function rename(file: string) {
  return file === FROM || file.startsWith(`${FROM}/`) ? `${TO}${file.slice(FROM.length)}` : file
}

// Read each file at its old path before it moves.
const rewrites = tracked
  .filter((file) => !checkIsKept(file) && TEXT_EXTENSIONS.has(path.extname(file)))
  .flatMap((file) => {
    const content = readFileSync(path.join(root, file), "utf8")

    const renamed = REPLACEMENTS.reduce(
      (text, [pattern, replacement]) => text.replaceAll(pattern, replacement),
      content
    )

    return renamed === content ? [] : [{ content: renamed, file: rename(file) }]
  })

if (tracked.some((file) => file === FROM || file.startsWith(`${FROM}/`))) {
  if (write) {
    execFileSync("mkdir", ["-p", path.dirname(path.join(root, TO))])
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

// Oxfmt sorts the imports again.
if (write && rewrites.length > 0) {
  execFileSync("pnpm", ["exec", "oxfmt", ...rewrites.map(({ file }) => file)], {
    cwd: root,
    stdio: "inherit",
  })
}
