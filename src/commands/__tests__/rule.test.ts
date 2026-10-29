import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import ruleCommand from "#commands/rule.ts"
import { toCustomRuleStub, toCustomRuleTestStub } from "#lib/workspace/custom-rules/index.ts"
import { createPrompterTestContext, runCommand } from "./command-test-helpers.ts"

describe("rule add", () => {
  it.effect("write the stub to .adamantite/rules and its test to tests/", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext()
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(ruleCommand, ["add", "no-process-env"], {
        files,
        layers: [prompter.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read(".adamantite/rules/no-process-env.ts")).toBe(
        toCustomRuleStub("no-process-env")
      )
      expect(files.read(".adamantite/rules/tests/no-process-env.ts")).toBe(
        toCustomRuleTestStub("no-process-env")
      )
      expect(files.exists(".adamantite/rules/AGENTS.md")).toBe(false)
      expect(prompter.logs).toStrictEqual([
        {
          level: "success",
          message:
            "Wrote .adamantite/rules/no-process-env.ts and .adamantite/rules/tests/no-process-env.ts.",
        },
        { level: "info", message: "Run the test with `adamantite rule test`." },
        {
          level: "info",
          message:
            '`custom()` from `adamantite/lint/custom` loads the rule. Run `adamantite doctor` to check the wiring. The "Custom rules" section of the Adamantite skill tells you how to write the rule and its test.',
        },
      ])
    })
  )

  it.effect("write to a custom folder, such as a monorepo tooling package", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext()

      const exit = yield* runCommand(
        ruleCommand,
        ["add", "--dir", "tooling/lint/rules", "no-window"],
        { files, layers: [createPrompterTestContext().layer] }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read("tooling/lint/rules/no-window.ts")).toBe(toCustomRuleStub("no-window"))
      expect(files.read("tooling/lint/rules/tests/no-window.ts")).toBe(
        toCustomRuleTestStub("no-window")
      )
      expect(files.exists(".adamantite")).toBe(false)
    })
  )

  it.effect.each([
    {
      existing: [".adamantite/rules/no-process-env.ts"],
      name: "keep an existing rule, and write no test",
    },
    {
      existing: [".adamantite/rules/tests/no-process-env.ts"],
      name: "keep an existing test, and write no rule",
    },
    {
      existing: [
        ".adamantite/rules/no-process-env.ts",
        ".adamantite/rules/tests/no-process-env.ts",
      ],
      name: "keep an existing rule and test",
    },
  ])("$name", ({ existing }) =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: Object.fromEntries(existing.map((file) => [file, "// mine\n"])),
      })

      const exit = yield* runCommand(ruleCommand, ["add", "no-process-env"], {
        files,
        layers: [createPrompterTestContext().layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "CustomRuleExists",
        paths: existing.map((file) => `${files.root}/${file}`),
      })
      expect(files.list()).toStrictEqual(existing)
      expect(existing.map((file) => files.read(file))).toStrictEqual(
        existing.map(() => "// mine\n")
      )
    })
  )

  it.effect("reject a name that is not kebab-case", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext()

      const exit = yield* runCommand(ruleCommand, ["add", "_helpers"], {
        files,
        layers: [createPrompterTestContext().layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "InvalidRuleName",
        name: "InvalidRuleName",
        rule: "_helpers",
      })
      expect(files.exists(".adamantite")).toBe(false)
    })
  )
})

describe("rule ast", () => {
  it.effect("print the ESTree-shaped AST without parenthesized expressions", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "src/value.ts": "export const value = (1 + 2) as number\n" },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(ruleCommand, ["ast", "src/value.ts"], {
        files,
        layers: [prompter.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)

      const [output] = prompter.messages

      expect(output).toContain('"type": "TSAsExpression"')
      expect(output).toContain('"type": "BinaryExpression"')
      expect(output).not.toContain("ParenthesizedExpression")
    })
  )

  it.effect("fail with the parse errors of a file that does not parse", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "src/broken.ts": "export const = 1\n" },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(ruleCommand, ["ast", "src/broken.ts"], {
        files,
        layers: [prompter.layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "FailedToParseSource",
        path: `${files.root}/src/broken.ts`,
      })
      expect(prompter.messages).toStrictEqual([])
    })
  )
})
