import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"

// Replay issue #642 from the repository root. Preview with `node scripts/rename-tailwind-preset.ts`,
// or apply with `--write`. Optional file paths limit the run to the first hand-checked unit.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = process.argv.slice(2).filter((argument) => argument !== "--write")

const files = [
  ["presets/lint/shadcn.ts", "presets/lint/tailwind.ts"],
  ["src/__tests__/presets/shadcn.test.ts", "src/__tests__/presets/tailwind.test.ts"],
  [
    "src/lib/integrations/tooling/oxlint/plugins/shadcn.ts",
    "src/lib/integrations/tooling/oxlint/plugins/tailwind.ts",
  ],
  [
    "src/lib/integrations/tooling/oxlint/plugins/__tests__/shadcn.test.ts",
    "src/lib/integrations/tooling/oxlint/plugins/__tests__/tailwind.test.ts",
  ],
  ["src/lib/integrations/tooling/oxlint/plugins/index.ts"],
  ["src/lib/integrations/tooling/oxlint/plugins/define.ts"],
  ["src/lib/integrations/tooling/oxlint/config.ts"],
  ["src/lib/integrations/tooling/oxlint/__tests__/config.test.ts"],
  ["src/lib/integrations/tooling/oxlint/__tests__/runtime.test.ts"],
  ["src/lib/assessment/__tests__/index.test.ts"],
  ["src/commands/init/prompts.ts"],
  ["src/commands/__tests__/init.test.ts"],
  ["README.md"],
  ["CODING_STANDARDS.md"],
  ["skills/adamantite/SKILL.md"],
  ["docs/architecture.md"],
  [".github/workflows/test.yml"],
] as const

// The npm package, rule namespace, settings, upstream links, and released history keep their names.
const replacements = [
  ["adamantite/lint/shadcn", "adamantite/lint/tailwind"],
  ["/lint/shadcn.ts", "/lint/tailwind.ts"],
  ["/plugins/shadcn.ts", "/plugins/tailwind.ts"],
  ["import shadcn from", "import tailwind from"],
  ["[shadcn,", "[tailwind,"],
  ["[shadcn]", "[tailwind]"],
  [", shadcn]", ", tailwind]"],
  [", shadcn,", ", tailwind,"],
  ["shadcn.rules", "tailwind.rules"],
  ['preset: "shadcn"', 'preset: "tailwind"'],
  ['label: "shadcn"', 'label: "tailwind"'],
  ['value: "shadcn"', 'value: "tailwind"'],
  ['["shadcn"]', '["tailwind"]'],
  [', "shadcn"]', ', "tailwind"]'],
  ['  "shadcn",', '  "tailwind",'],
  ["`shadcn`", "`tailwind`"],
  ["The shadcn plugin", "The Tailwind preset"],
  ["The shadcn preset", "The Tailwind preset"],
  ["the shadcn preset", "the tailwind preset"],
  ["#the-shadcn-preset", "#the-tailwind-preset"],
  ["shadcn preset", "tailwind preset"],
  ["react and shadcn presets", "react and tailwind presets"],
  ["shadcn and react preset overlap", "tailwind and react preset overlap"],
  ["leave shadcn findings", "leave design-system findings"],
] as const

for (const file of files) {
  const [from, destination] = file
  const to = destination ?? from

  if (selected.length > 0 && !selected.includes(from)) {
    continue
  }

  const target = resolve(root, to)
  const source = existsSync(resolve(root, from)) ? resolve(root, from) : target
  const content = readFileSync(source, "utf8")
  const renamed = replacements.reduce(
    (text, [before, after]) => text.replaceAll(before, after),
    content
  )

  if (content === renamed && source === target) {
    continue
  }

  if (write) {
    writeFileSync(source, renamed)

    if (source !== target) {
      renameSync(source, target)
    }
  }

  console.info(`${write ? "Updated" : "Would update"} ${from}${from === to ? "" : ` -> ${to}`}`)
}
