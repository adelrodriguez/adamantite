import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"

// Replay issue #856. Preview without --write. Optional paths select the hand-checked first unit.
const root = resolve(import.meta.dirname, "..")
const write = process.argv.includes("--write")
const selected = process.argv.slice(2).filter((argument) => argument !== "--write")

const edits = [
  {
    file: "presets/lint/core.ts",
    replacements: [
      ['"jsdoc", "promise"]', '"jsdoc", "promise", "node"]'],
      [
        '    "no-with": "error",',
        '    "no-with": "error",\n    "node/handle-callback-err": "error",\n    "node/no-exports-assign": "error",\n    "node/no-mixed-requires": "error",\n    "node/no-new-require": "error",\n    "node/no-path-concat": "error",',
      ],
    ],
  },
  {
    file: "package.json",
    replacements: [
      [
        '    "./lint/node": {\n      "types": "./dist/presets/lint/node.d.ts",\n      "default": "./dist/presets/lint/node.js"\n    },\n',
        "",
      ],
    ],
  },
  {
    file: "src/lib/integrations/tooling/oxlint/presets.ts",
    replacements: [
      [
        '  {\n    hint: "Check Node.js callbacks and CommonJS modules.",\n    label: "node",\n    name: "node",\n  },\n',
        "",
      ],
      ['["shadcn", "react-doctor", "antislop"]', '["shadcn", "react-doctor", "antislop", "node"]'],
    ],
  },
  {
    file: "oxlint.config.ts",
    replacements: [
      ['import node from "./presets/lint/node.ts"\n', ""],
      ["[core, node, effect, strict, vitest]", "[core, effect, strict, vitest]"],
    ],
  },
  {
    file: "src/__tests__/presets/overlap.test.ts",
    replacements: [
      ['import node from "#presets/lint/node.ts"\n', ""],
      ["  node,\n", ""],
    ],
  },
  {
    file: "src/__tests__/presets/stacks.ts",
    replacements: [[', "node"', ""]],
  },
  {
    file: "src/lib/integrations/tooling/oxlint/__tests__/config.test.ts",
    replacements: [
      ['import node from "adamantite/lint/node"', 'import vitest from "adamantite/lint/vitest"'],
      ["[effect, strict, core, node]", "[effect, strict, core, vitest]"],
    ],
  },
  {
    file: "GLOSSARY.md",
    replacements: [
      ["`effect`, `vitest`,\n`node`, and `strict`", "`effect`, `vitest`,\nand `strict`"],
    ],
  },
  {
    file: "README.md",
    replacements: [
      ["`jest`, `vitest`, `node`, `architecture`", "`jest`, `vitest`, `architecture`"],
      [
        readFileSync(resolve(root, "README.md"), "utf8")
          .split("\n")
          .find((line) => line.startsWith("| `adamantite/lint/node`"))
          ?.concat("\n") ?? "",
        "",
      ],
      [
        "Core Oxlint rules.",
        "Core Oxlint rules, including Node.js callbacks and CommonJS modules.",
      ],
    ],
  },
] as const

for (const { file, replacements } of edits) {
  if (selected.length > 0 && !selected.includes(file)) {
    continue
  }

  const path = resolve(root, file)
  const content = readFileSync(path, "utf8")

  const updated = replacements.reduce((source, [before, after]) => {
    if (before === "" || (after.includes(before) && source.includes(after))) {
      return source
    }

    return source.replaceAll(before, after)
  }, content)

  if (updated !== content) {
    if (write) {
      writeFileSync(path, updated)
    }

    console.info(`${write ? "Updated" : "Would update"} ${file}`)
  }
}

const nodePreset = resolve(root, "presets/lint/node.ts")

if (
  (selected.length === 0 || selected.includes("presets/lint/node.ts"))
  && existsSync(nodePreset)
) {
  if (write) {
    rmSync(nodePreset)
  }

  console.info(`${write ? "Removed" : "Would remove"} presets/lint/node.ts`)
}
