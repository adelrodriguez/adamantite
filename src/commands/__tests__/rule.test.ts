import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import ruleCommand from "#commands/rule.ts"
import { toCustomRuleStub, toCustomRuleTestStub } from "#lib/workspace/custom-rules/index.ts"
import {
  createPrompterTestContext,
  createRunnerTestContext,
  runCommand,
} from "./command-test-helpers.ts"

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

const PACKAGE_JSON = JSON.stringify({ name: "app" })

function makeConfig(...customCalls: string[]) {
  return [
    'import custom from "adamantite/lint/custom"',
    'import { defineConfig } from "oxlint"',
    "",
    `export default defineConfig({ extends: [${customCalls.join(", ")}] })`,
    "",
  ].join("\n")
}

describe("rule test", () => {
  it.effect("run node --test on the tests of each rules folder that custom() loads", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/no-a.ts": "export default {}\n",
          ".adamantite/rules/tests/_cases.ts": "export const cases = []\n",
          ".adamantite/rules/tests/no-a.ts": "// test\n",
          ".adamantite/rules/tests/notes.md": "# Notes\n",
          "oxlint.config.ts": makeConfig(
            "custom()",
            'custom({ dir: "tooling/rules", name: "acme" })'
          ),
          "package.json": PACKAGE_JSON,
          "tooling/rules/tests/no-b.ts": "// test\n",
        },
      })
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [createPrompterTestContext().layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([
        {
          args: ["--test", ".adamantite/rules/tests/no-a.ts", "tooling/rules/tests/no-b.ts"],
          command: "node",
          title: "🧪 Testing custom rules",
        },
      ])
    })
  )

  it.effect("run the tests of a workspace package in a monorepo", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
          "packages/web/.adamantite/rules/tests/no-window.ts": "// test\n",
          "packages/web/oxlint.config.ts": makeConfig('custom({ name: "web" })'),
          "packages/web/package.json": JSON.stringify({ name: "web" }),
        },
      })
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [createPrompterTestContext().layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations.map((invocation) => invocation.args)).toStrictEqual([
        ["--test", "packages/web/.adamantite/rules/tests/no-window.ts"],
      ])
    })
  )

  it.effect("fail with the exit code of node --test", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/tests/no-a.ts": "// test\n",
          "oxlint.config.ts": makeConfig("custom()"),
          "package.json": PACKAGE_JSON,
        },
      })

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [createPrompterTestContext().layer, createRunnerTestContext([1]).layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "CommandFailed",
        command: "node",
        exitCode: 1,
      })
    })
  )

  it.effect("warn about a rules folder that it cannot find, and run the other tests", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/tests/no-a.ts": "// test\n",
          "oxlint.config.ts": `const RULES_DIR = "tooling/rules"\n${makeConfig(
            "custom()",
            'custom({ dir: RULES_DIR, name: "acme" })'
          )}`,
          "package.json": PACKAGE_JSON,
          "tooling/rules/tests/no-b.ts": "// test\n",
        },
      })
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toStrictEqual([
        {
          level: "warning",
          message:
            "`rule test` cannot read the `dir` of a `custom()` call in `oxlint.config.ts`, because it is not a string literal. It does not run the tests of that rules folder.",
        },
      ])
      expect(runner.invocations.map((invocation) => invocation.args)).toStrictEqual([
        ["--test", ".adamantite/rules/tests/no-a.ts"],
      ])
    })
  )

  it.effect("warn about an import that it cannot follow when it finds no tests", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "oxlint.config.ts": `import tooling from "./tooling/missing.ts"\n${makeConfig("tooling")}`,
          "package.json": PACKAGE_JSON,
        },
      })
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([])
      expect(prompter.logs).toStrictEqual([
        {
          level: "warning",
          message:
            "`rule test` cannot resolve the import of `./tooling/missing.ts` in `oxlint.config.ts`, so it does not run the tests of the rules folders behind it.",
        },
        {
          level: "info",
          message:
            "No custom rule tests found. `adamantite rule add <name>` writes a rule and its test.",
        },
      ])
    })
  )

  it.effect.each<{ files: Record<string, string>; name: string }>([
    {
      files: { "oxlint.config.ts": makeConfig("custom()"), "package.json": PACKAGE_JSON },
      name: "a rules folder without tests",
    },
    {
      // Oxlint does not load a rules folder that no `custom()` call names, so its tests do not run.
      files: { ".adamantite/rules/tests/no-a.ts": "// test\n", "package.json": PACKAGE_JSON },
      name: "tests in a folder that no custom() call loads",
    },
  ])("say that there are no tests, and pass, with $name", ({ files: fixture }) =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({ files: fixture })
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([])
      expect(prompter.logs).toStrictEqual([
        {
          level: "info",
          message:
            "No custom rule tests found. `adamantite rule add <name>` writes a rule and its test.",
        },
      ])
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
