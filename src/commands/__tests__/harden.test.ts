import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import hardenCommand from "#commands/harden.ts"
import { createPrompterTestContext, runCommand } from "./command-test-helpers.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

function getHeadings(markdown: string) {
  return markdown.match(/^#{1,3} .+$/gm) ?? []
}

function getSection(markdown: string, heading: string) {
  const start = markdown.indexOf(`\n${heading}\n`)

  if (start === -1) {
    throw new Error(`No \`${heading}\` section in the prompt`)
  }

  const end = markdown.slice(start + 1).search(/\n#{1,3} /)

  return end === -1 ? markdown.slice(start) : markdown.slice(start, start + 1 + end)
}

function getListItems(section: string) {
  return section.match(/^- .+$/gm) ?? []
}

// The phrases that are missing from a section, so a failure names each one.
function getMissingPhrases(section: string, phrases: readonly string[]) {
  return phrases.filter((phrase) => !section.includes(phrase))
}

const INSTALLED = manifest({ devDependencies: { adamantite: "1.0.0" } })

const CUSTOM_RULES_CONFIG = `import { defineConfig } from "oxlint"
import core from "adamantite/lint"
import custom from "adamantite/lint/custom"

export default defineConfig({
  extends: [core, custom({ dir: "tooling/rules", name: "acme" })],
})
`

const CORE_CONFIG = `import { defineConfig } from "oxlint"
import core from "adamantite/lint"

export default defineConfig({
  extends: [core],
})
`

function runHarden(files: Record<string, string>) {
  return Effect.gen(function* () {
    const prompter = createPrompterTestContext()
    const exit = yield* runCommand(hardenCommand, [], {
      files: createFileSystemTestContext({ files }),
      layers: [prompter.layer],
    })

    return { exit, prompter }
  })
}

function runHardenPrompt(files: Record<string, string>) {
  return Effect.gen(function* () {
    const { exit, prompter } = yield* runHarden(files)

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(prompter.messages).toHaveLength(1)

    return prompter.messages[0] ?? ""
  })
}

describe("harden", () => {
  it.effect("print the prompt and succeed in a non-interactive terminal", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden({
        "oxlint.config.ts": CORE_CONFIG,
        "package.json": INSTALLED,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.messages.map(getHeadings)).toStrictEqual([
        [
          "# Adamantite harden",
          "## Context",
          "### Oxlint config",
          "### Rules folders",
          "### Instructions",
          "## 1. List the written standards",
          "## 2. Survey the code",
          "## 3. Drop what a tool already enforces",
          "## 4. Place each candidate on the enforcement ladder",
          "## 5. Show the candidates and wait for approval",
          "## 6. Write the approved standards",
          "## Verify",
        ],
      ])
      expect(prompter).toMatchObject({ intros: [], logs: [], notes: [], outros: [] })
    })
  )

  it.effect("list the Oxlint config, its rules folder, and the instruction files that exist", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "AGENTS.md": "# AGENTS.md\n",
        "docs/adr/0001-use-adamantite.md": "# Use Adamantite\n",
        "oxlint.config.ts": CUSTOM_RULES_CONFIG,
        "package.json": INSTALLED,
      })

      expect(getListItems(getSection(prompt, "### Oxlint config"))).toStrictEqual([
        "- `oxlint.config.ts`",
      ])
      expect(getListItems(getSection(prompt, "### Rules folders"))).toStrictEqual([
        "- `tooling/rules`",
      ])
      expect(getListItems(getSection(prompt, "### Instructions"))).toStrictEqual([
        "- `AGENTS.md`",
        "- `docs/adr`",
      ])
    })
  )

  it.effect("tell the agent to add custom() when no config loads a rules folder", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CORE_CONFIG,
        "package.json": INSTALLED,
      })
      const rulesFolders = getSection(prompt, "### Rules folders")

      expect(rulesFolders).toContain("adamantite/lint/custom")
      expect(rulesFolders).toContain(".adamantite/rules")
      expect(getSection(prompt, "### Instructions")).toContain("CODING_STANDARDS.md")
    })
  )

  it.effect("defer adamantite init to the approval when no Oxlint config exists", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({ "package.json": INSTALLED })

      expect(
        getMissingPhrases(getSection(prompt, "### Oxlint config"), [
          "Do not create one.",
          "run `adamantite init` before you write rules",
        ])
      ).toStrictEqual([])
    })
  )

  it.effect("keep placeholder-like text in a detected path literal", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace("tooling/rules", "rules/{{version}}"),
        "package.json": INSTALLED,
      })

      expect(getListItems(getSection(prompt, "### Rules folders"))).toStrictEqual([
        "- `rules/{{version}}`",
      ])
    })
  )

  it.effect("point to the config when a custom() folder is not a string literal", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CUSTOM_RULES_CONFIG.replace('dir: "tooling/rules"', "dir: rulesDir"),
        "package.json": INSTALLED,
      })

      expect(getSection(prompt, "### Rules folders")).toContain("`oxlint.config.ts`")
    })
  )

  it.effect("have the approval gate, the write steps, and the verification commands", () =>
    Effect.gen(function* () {
      const prompt = yield* runHardenPrompt({
        "oxlint.config.ts": CORE_CONFIG,
        "package.json": INSTALLED,
      })

      expect(
        getMissingPhrases(getSection(prompt, "## 3. Drop what a tool already enforces"), [
          "lint a counterexample from step 2",
          "Do not write a sample file",
        ])
      ).toStrictEqual([])
      expect(
        getMissingPhrases(getSection(prompt, "## 5. Show the candidates and wait for approval"), [
          "Do not change any file before the user approves.",
          "If no human can approve",
        ])
      ).toStrictEqual([])
      expect(
        getMissingPhrases(getSection(prompt, "## 6. Write the approved standards"), [
          "`adamantite rule add <name>`",
          "pass it with `--dir`",
          "`RuleTester`",
          "delete the instruction of each written standard",
          "states the standard and why it exists",
          "For a custom rule, use the `rules` option of `custom()`",
          "For a preset rule or an import rule, set it to `warn` in the Oxlint config",
          "`CODING_STANDARDS.md`",
        ])
      ).toStrictEqual([])
      expect(
        getMissingPhrases(getSection(prompt, "## Verify"), [
          "`adamantite check`",
          "`adamantite doctor`",
        ])
      ).toStrictEqual([])
    })
  )

  it.effect("fail when Adamantite is not installed", () =>
    Effect.gen(function* () {
      const { exit, prompter } = yield* runHarden({ "package.json": manifest({}) })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toStrictEqual([
        "`adamantite` is not installed in this project. Install it before running `adamantite harden`.",
      ])
    })
  )
})
