import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import ruleCommand, { renderTrial } from "#commands/rule.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { toCustomRuleStub } from "#lib/workspace/custom-rules/index.ts"
import {
  createPrompterTestContext,
  createRunnerTestContext,
  interactiveTerminalLayer,
  runCommand,
} from "./command-test-helpers.ts"

describe("rule add", () => {
  it.effect("write only the rule stub to .adamantite/lint", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext()
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(ruleCommand, ["add", "no-process-env"], {
        files,
        layers: [prompter.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read(".adamantite/lint/no-process-env.ts")).toBe(
        toCustomRuleStub("no-process-env")
      )
      expect(files.list()).toStrictEqual([".adamantite/lint/no-process-env.ts"])
      expect(prompter.logs).toStrictEqual([
        {
          level: "success",
          message: "Wrote .adamantite/lint/no-process-env.ts.",
        },
        {
          level: "info",
          message:
            '`custom()` from `adamantite/rules` loads the rule. Run `adamantite doctor` to check the wiring. The "Custom rules" section of the Adamantite skill tells agents how to verify the rule with temporary cases.',
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
      expect(files.list()).toStrictEqual(["tooling/lint/rules/no-window.ts"])
      expect(files.exists(".adamantite")).toBe(false)
    })
  )

  it.effect("preserve an optional test while adding only the rule", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ".adamantite/lint/no-process-env.test.ts": "// user-owned test\n" },
      })

      const exit = yield* runCommand(ruleCommand, ["add", "no-process-env"], {
        files,
        layers: [createPrompterTestContext().layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read(".adamantite/lint/no-process-env.test.ts")).toBe("// user-owned test\n")
      expect(files.read(".adamantite/lint/no-process-env.ts")).toBe(
        toCustomRuleStub("no-process-env")
      )
    })
  )

  it.effect("keep an existing rule unchanged", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ".adamantite/lint/no-process-env.ts": "// mine\n" },
      })

      const exit = yield* runCommand(ruleCommand, ["add", "no-process-env"], {
        files,
        layers: [createPrompterTestContext().layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "CustomRuleExists",
        paths: [`${files.root}/.adamantite/lint/no-process-env.ts`],
      })
      expect(files.read(".adamantite/lint/no-process-env.ts")).toBe("// mine\n")
      expect(files.list()).toStrictEqual([".adamantite/lint/no-process-env.ts"])
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

describe("rule add test", () => {
  it.effect("list existing rules for selection when no name is given", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/_helpers.ts": "// helper\n",
          ".adamantite/lint/no-debugger.ts": "// rule\n",
          ".adamantite/lint/no-window.test.ts": "// existing test\n",
          ".adamantite/lint/no-window.ts": "// another rule\n",
        },
      })
      const prompter = createPrompterTestContext({ selectResponses: ["no-debugger"] })
      const exit = yield* runCommand(ruleCommand, ["add", "test"], {
        files,
        layers: [prompter.layer, interactiveTerminalLayer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.selectCalls).toStrictEqual([
        {
          message: "Which rule needs a test?",
          options: [
            { label: "no-debugger", value: "no-debugger" },
            { label: "no-window", value: "no-window" },
          ],
        },
      ])
      expect(files.read(".adamantite/lint/no-debugger.test.ts")).toContain(
        'import rule from "./no-debugger.ts"'
      )
      expect(files.read(".adamantite/lint/no-window.test.ts")).toBe("// existing test\n")
    })
  )

  it.effect("list rules without writing a file when the terminal is not interactive", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ".adamantite/lint/no-debugger.ts": "// rule\n" },
      })
      const prompter = createPrompterTestContext()
      const exit = yield* runCommand(ruleCommand, ["add", "test"], {
        files,
        layers: [prompter.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.messages).toStrictEqual(["no-debugger"])
      expect(prompter.selectCalls).toStrictEqual([])
      expect(files.list()).toStrictEqual([".adamantite/lint/no-debugger.ts"])
    })
  )

  it.effect("write to --path with an import relative to that test file", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ".adamantite/lint/no-debugger.ts": "// rule\n" },
      })
      const exit = yield* runCommand(
        ruleCommand,
        ["add", "test", "no-debugger", "--path", "tests/lint/no-debugger.test.ts"],
        { files, layers: [createPrompterTestContext().layer] }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read("tests/lint/no-debugger.test.ts")).toContain(
        'import rule from "../../.adamantite/lint/no-debugger.ts"'
      )
      expect(files.exists(".adamantite/lint/no-debugger.test.ts")).toBe(false)
    })
  )

  it.effect("add an optional test beside an existing rule without changing the rule", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ".adamantite/lint/no-debugger.ts": "// user-owned rule\n" },
      })
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext()
      const exit = yield* runCommand(ruleCommand, ["add", "test", "no-debugger"], {
        files,
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read(".adamantite/lint/no-debugger.ts")).toBe("// user-owned rule\n")
      const test = files.read(".adamantite/lint/no-debugger.test.ts")
      expect(test).toContain('import rule from "./no-debugger.ts"')
      expect(runner.invocations).toStrictEqual([])
      expect(files.list()).toStrictEqual([
        ".adamantite/lint/no-debugger.test.ts",
        ".adamantite/lint/no-debugger.ts",
      ])
    })
  )

  it.effect("require an existing rule before creating a test", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext()
      const exit = yield* runCommand(ruleCommand, ["add", "test", "no-debugger"], {
        files,
        layers: [createPrompterTestContext().layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "CustomRuleNotFound",
        rule: "no-debugger",
      })
      expect(files.list()).toStrictEqual([])
    })
  )

  it.effect("preserve an existing optional test", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/no-debugger.test.ts": "// user-owned test\n",
          ".adamantite/lint/no-debugger.ts": "// rule\n",
        },
      })
      const exit = yield* runCommand(ruleCommand, ["add", "test", "no-debugger"], {
        files,
        layers: [createPrompterTestContext().layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "CustomRuleExists",
        paths: [`${files.root}/.adamantite/lint/no-debugger.test.ts`],
      })
      expect(files.read(".adamantite/lint/no-debugger.test.ts")).toBe("// user-owned test\n")
    })
  )

  it.effect("use the rule extension in a custom rules folder", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "tooling/lint/no-window.mjs": "export default {}\n" },
      })
      const exit = yield* runCommand(
        ruleCommand,
        ["add", "test", "no-window", "--dir", "tooling/lint"],
        { files, layers: [createPrompterTestContext().layer] }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read("tooling/lint/no-window.test.ts")).toContain(
        'import rule from "./no-window.mjs"'
      )
      expect(files.exists(".adamantite")).toBe(false)
    })
  )
})

function makeConfig(...customCalls: string[]) {
  return [
    'import custom from "adamantite/rules"',
    'import { defineConfig } from "oxlint"',
    "",
    `export default defineConfig({ extends: [${customCalls.join(", ")}] })`,
    "",
  ].join("\n")
}

describe("rule test", () => {
  it.effect("run an explicit --path without needing a custom() config", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "tests/lint/no-debugger.test.ts": "// test\n" },
      })
      const runner = createRunnerTestContext()
      const exit = yield* runCommand(
        ruleCommand,
        ["test", "--path", "tests/lint/no-debugger.test.ts"],
        {
          files,
          layers: [createPrompterTestContext().layer, runner.layer],
        }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([
        {
          args: ["--test", `${files.root}/tests/lint/no-debugger.test.ts`],
          command: "node",
          title: "🧪 Testing custom rules",
        },
      ])
    })
  )

  it.effect("run node --test on the tests of each rules folder that custom() loads", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/_cases.test.ts": "export const cases = []\n",
          ".adamantite/lint/no-a.test.ts": "// test\n",
          ".adamantite/lint/no-a.ts": "export default {}\n",
          ".adamantite/lint/notes.md": "# Notes\n",
          "oxlint.config.ts": makeConfig(
            "custom()",
            'custom({ dir: "tooling/rules", name: "acme" })'
          ),
          "package.json": PACKAGE_JSON,
          "tooling/rules/no-b.test.ts": "// test\n",
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
          args: ["--test", ".adamantite/lint/no-a.test.ts", "tooling/rules/no-b.test.ts"],
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
          "package.json": yield* stringifyJson({ name: "root", workspaces: ["packages/*"] }),
          "packages/web/.adamantite/lint/no-window.test.ts": "// test\n",
          "packages/web/oxlint.config.ts": makeConfig('custom({ name: "web" })'),
          "packages/web/package.json": yield* stringifyJson({ name: "web" }),
        },
      })
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [createPrompterTestContext().layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations.map((invocation) => invocation.args)).toStrictEqual([
        ["--test", "packages/web/.adamantite/lint/no-window.test.ts"],
      ])
    })
  )

  it.effect("fail with the exit code of node --test", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/lint/no-a.test.ts": "// test\n",
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
          ".adamantite/lint/no-a.test.ts": "// test\n",
          "oxlint.config.ts": `const RULES_DIR = "tooling/rules"\n${makeConfig(
            "custom()",
            'custom({ dir: RULES_DIR, name: "acme" })'
          )}`,
          "package.json": PACKAGE_JSON,
          "tooling/rules/no-b.test.ts": "// test\n",
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
        ["--test", ".adamantite/lint/no-a.test.ts"],
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
            "No tests were found for loaded custom rules. Run `adamantite doctor` to check rule setup, or `adamantite rule add test` to add a test.",
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
      files: { ".adamantite/lint/no-a.test.ts": "// test\n", "package.json": PACKAGE_JSON },
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
            "No tests were found for loaded custom rules. Run `adamantite doctor` to check rule setup, or `adamantite rule add test` to add a test.",
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

describe("rule try", () => {
  const reportCase = {
    expected: "reported",
    path: "src/cart.ts",
    source: Option.some("/tmp/before.ts"),
  } as const
  const acceptCase = { expected: "accepted", path: "src/cart.ts", source: Option.none() } as const
  const report = { column: 1, line: 1, message: "'node:fs' import is restricted from being used." }

  it("show each case with its verdict and the reports of the rule", () => {
    expect(
      renderTrial("no-restricted-imports", { _tag: "Error", options: [{ paths: ["node:fs"] }] }, [
        { case: reportCase, config: "oxlint.config.ts", diagnostics: [report] },
        { case: acceptCase, config: "oxlint.config.ts", diagnostics: [report] },
      ])
    ).toBe(
      [
        'Trial of `no-restricted-imports` at ["error",{"paths":["node:fs"]}], in `oxlint.config.ts`.',
        "",
        "✓ `src/cart.ts` from `/tmp/before.ts`: reported, as expected.",
        "    1:1  'node:fs' import is restricted from being used.",
        "✗ `src/cart.ts`: reported, but it must be accepted.",
        "    1:1  'node:fs' import is restricted from being used.",
        "",
        "1 of 2 cases is different from the expected result.",
      ].join("\n")
    )
  })

  it("say that the trial keeps the project setting, and that each case is as expected", () => {
    expect(
      renderTrial("no-console", { _tag: "Current" }, [
        { case: acceptCase, config: "packages/web/oxlint.config.ts", diagnostics: [] },
      ])
    ).toBe(
      [
        "Trial of `no-console` as the project config sets it, in `packages/web/oxlint.config.ts`.",
        "",
        "✓ `src/cart.ts`: accepted, as expected.",
        "",
        "All cases produced the expected result.",
      ].join("\n")
    )
  })

  it.effect.each([
    {
      args: ["--current", "--options", "[]", "--report", "src/cart.ts"],
      error: { _tag: "InvalidTrialOptions" },
      name: "reject --current with --options",
    },
    {
      args: ["--report", "../cart.ts"],
      error: { _tag: "InvalidTrialCase", value: "../cart.ts" },
      name: "reject a case outside the project",
    },
  ])("$name before it copies the project", ({ args, error }) =>
    Effect.gen(function* () {
      // The test spawner dies on each process, so the error comes before the copy.
      const exit = yield* runCommand(ruleCommand, ["try", "no-console", ...args], {
        files: createFileSystemTestContext(),
        layers: [createPrompterTestContext().layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject(error)
    })
  )
})
