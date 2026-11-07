import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Reapply the architecture preset's registry and reference updates. Each edit is idempotent.
const edits = [
  {
    after: '  "node",\n  "architecture",\n  "strict",',
    before: '  "node",\n  "strict",',
    file: "src/lib/integrations/tooling/oxlint/config.ts",
  },
  {
    after:
      '        {\n          hint: "Load layer and import-owner rules, then configure them in your project",\n          label: "architecture",\n          value: "architecture",\n        },\n        {\n          hint: "Framework-neutral strictness:',
    before: '        {\n          hint: "Framework-neutral strictness:',
    file: "src/commands/init/prompts.ts",
  },
  {
    after: "`jest`, `vitest`, `node`, `architecture`, `strict`, `antislop`, and `shadcn`.",
    before: "`jest`, `vitest`, `node`, `strict`, `antislop`, and `shadcn`.",
    file: "README.md",
  },
  {
    after:
      "| `adamantite/lint/architecture` | Load first-party rules for project-defined layer maps and import owners. No rules are enabled by default. |\n| `adamantite/lint/strict`",
    before: "| `adamantite/lint/strict`",
    file: "README.md",
    marker: "| `adamantite/lint/architecture`",
  },
  {
    after: "`vitest`, `node`, `architecture`, `strict`, `antislop`, `shadcn`;",
    before: "`vitest`, `node`, `strict`, `antislop`, `shadcn`;",
    file: "skills/adamantite/SKILL.md",
  },
  {
    after:
      "The `architecture` preset loads the first-party plugin without enabling rules. The `strict`\npreset also loads it. Configure `adamantite/layers` to enforce one-way imports between the",
    before:
      "The `strict` preset also loads `adamantite/layers`, which enforces one-way imports between the",
    file: "skills/adamantite/SKILL.md",
  },
  {
    after:
      "The plugin also provides `adamantite/import-owners`, which restricts an import to the files",
    before:
      "The `strict` preset also loads `adamantite/import-owners`, which restricts an import to the files",
    file: "skills/adamantite/SKILL.md",
  },
]

for (const { after, before, file, marker = after } of edits) {
  const path = join(import.meta.dirname, "..", file)
  const content = readFileSync(path, "utf8")

  if (content.includes(marker)) {
    continue
  }

  if (!content.includes(before)) {
    throw new Error(`Expected the architecture preset update site in ${file}`)
  }

  writeFileSync(path, content.replace(before, after))
}
