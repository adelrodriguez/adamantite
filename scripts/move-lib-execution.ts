import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

// Split `src/lib/execution/` as issue #884 does. `CodingAgents` moves to `src/lib/handoff/`, the
// command runner and the forwarded arguments move to `src/lib/shared/`, and the skill helpers move
// to the agents integration, their only user. The script moves each file with `git mv`, then points
// every `#lib/execution/...` import and every `src/lib/execution/...` path in the tracked text files
// at the new place, and changes the layer map. Preview with `node scripts/move-lib-execution.ts`.
// Apply with `--write`.
//
// The prose that names the layer, in docs/architecture.md, and the relative path of the skill
// macro change by hand after the script.
const root = path.resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")

const MOVES = [
  ["execution/coding-agents.ts", "handoff/coding-agents.ts"],
  ["execution/__tests__/coding-agents.test.ts", "handoff/__tests__/coding-agents.test.ts"],
  ["execution/command-runner.ts", "shared/command-runner.ts"],
  ["execution/__tests__/command-runner.test.ts", "shared/__tests__/command-runner.test.ts"],
  ["execution/forwarded-arguments.ts", "shared/forwarded-arguments.ts"],
  ["execution/skill.ts", "integrations/agents/skill.ts"],
  ["execution/skill.macro.ts", "integrations/agents/skill.macro.ts"],
  ["execution/__tests__/skill.test.ts", "integrations/agents/__tests__/skill.test.ts"],
] as const

function escape(text: string) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

const REPLACEMENTS: ReadonlyArray<readonly [pattern: RegExp, replacement: string]> = MOVES.flatMap(
  ([from, to]) => [
    [new RegExp(`#lib/${escape(from)}`, "g"), `#lib/${to}`] as const,
    [new RegExp(`src/lib/${escape(from)}`, "g"), `src/lib/${to}`] as const,
  ]
)

// `handoff` takes the place of `execution`, and `sort-keys` wants it after `hardening`.
const LAYER_MAP: ReadonlyArray<readonly [pattern: RegExp, replacement: string]> = [
  [/^ +execution: \{ imports: \["shared"\] \},\n/gm, ""],
  [
    /^( +)hardening: \{ imports: \["integrations"\] \},\n( +)integrations: \{ imports: \["execution", "project"\] \},$/gm,
    '$1handoff: { imports: ["shared"] },\n$1hardening: { imports: ["integrations"] },\n$2integrations: { imports: ["handoff", "project"] },',
  ],
]

// The codemods of earlier moves keep their paths, and so does released history. The rule tests
// and the fixtures model other projects, whose paths only look like the ones of this repository.
function checkIsKept(file: string) {
  return (
    (file.startsWith("scripts/") && !file.startsWith("scripts/test-"))
    || file.startsWith("presets/")
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
  const move = MOVES.find(([from]) => file === `src/lib/${from}`)

  return move === undefined ? file : `src/lib/${move[1]}`
}

// Read each file at its old path before it moves.
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

for (const [from, to] of MOVES) {
  if (!tracked.includes(`src/lib/${from}`)) {
    continue
  }

  if (write) {
    mkdirSync(path.dirname(path.join(root, "src/lib", to)), { recursive: true })
    execFileSync("git", ["mv", `src/lib/${from}`, `src/lib/${to}`], { cwd: root })
  }

  console.info(`${write ? "Moved" : "Would move"} src/lib/${from} to src/lib/${to}`)
}

for (const { content, file } of rewrites) {
  if (write) {
    writeFileSync(path.join(root, file), content)
  }

  console.info(`${write ? "Updated" : "Would update"} ${file}`)
}

// Oxfmt sorts the imports, and the new paths sort in other places.
if (write && rewrites.length > 0) {
  execFileSync("pnpm", ["exec", "oxfmt", ...rewrites.map(({ file }) => file)], {
    cwd: root,
    stdio: "inherit",
  })
}
