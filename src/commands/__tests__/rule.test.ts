import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { createTerminalTestContext } from "#__tests__/terminal.ts"
import ruleCommand, { renderTrial } from "#commands/rule.ts"
import { CurrentSetting, ErrorSetting } from "#lib/hardening/trial.ts"
import {
  CommandFailed,
  CustomRuleExists,
  CustomRuleNotFound,
  FailedToParseSource,
  InvalidRuleName,
} from "#lib/shared/errors.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { toCustomRuleStub } from "#lib/workspace/custom-rules/index.ts"
import { createRunnerTestContext, promptingLayer, runCommand } from "./command-test-helpers.ts"

describe("rule add", () => {
  it.effect("write only the rule stub to .adamantite/lint", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext()
      const logLines: unknown[] = []

      const exit = yield* runCommand(ruleCommand, ["add", "no-process-env"], {
        files,
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read(".adamantite/lint/no-process-env.ts")).toBe(
        toCustomRuleStub("no-process-env")
      )
      expect(files.list()).toStrictEqual([".adamantite/lint/no-process-env.ts"])
      expect(logLines).toStrictEqual([
        "✔ Wrote .adamantite/lint/no-process-env.ts.",
        '● `custom()` from `adamantite/rules` loads the rule. Run `adamantite doctor` to check the wiring. The "Custom rules" section of the Adamantite skill tells agents how to verify the rule with temporary cases.',
      ])
    })
  )

  it.effect("write to a custom folder, such as a monorepo tooling package", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext()

      const exit = yield* runCommand(
        ruleCommand,
        ["add", "--dir", "tooling/lint/rules", "no-window"],
        { files }
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
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toBeInstanceOf(CustomRuleExists)
      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
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
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toBeInstanceOf(InvalidRuleName)
      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        name: "InvalidRuleName",
        rule: "_helpers",
      })
      expect(files.exists(".adamantite")).toBe(false)
    })
  )

  it.effect("create a rule named test, because test is not a subcommand of add", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext()

      const exit = yield* runCommand(ruleCommand, ["add", "test"], {
        files,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read(".adamantite/lint/test.ts")).toBe(toCustomRuleStub("test"))
      expect(files.list()).toStrictEqual([".adamantite/lint/test.ts"])
    })
  )

  it.effect("reject the former route that created a test", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ".adamantite/lint/no-debugger.ts": "// rule\n" },
      })

      const exit = yield* runCommand(ruleCommand, ["add", "test", "no-debugger"], {
        files,
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(files.list()).toStrictEqual([".adamantite/lint/no-debugger.ts"])
    })
  )
})

const PACKAGE_JSON = JSON.stringify({ name: "app" })

describe("rule test add", () => {
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

      const terminal = createTerminalTestContext(["enter"])

      const exit = yield* runCommand(ruleCommand, ["test", "add"], {
        files,
        layers: [promptingLayer],
        terminal,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      // The first frame offers the two rules only, because the helper file is not a rule.
      expect(terminal.output()).toBe(
        "? Which rule needs a test? › \n❯ no-debugger \n  no-window ✔ Which rule needs a test? …  no-debugger\n"
      )
      expect(files.read(".adamantite/lint/no-debugger.test.ts")).toContain(
        'import rule from "./no-debugger.ts"'
      )
      expect(files.read(".adamantite/lint/no-window.test.ts")).toBe("// existing test\n")
    })
  )

  it.effect("write no test and exit with 1 when the user cancels the rule prompt", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ".adamantite/lint/no-debugger.ts": "// rule\n" },
      })

      const logLines: unknown[] = []

      const exit = yield* runCommand(ruleCommand, ["test", "add"], {
        files,
        layers: [promptingLayer],
        logLines,
        terminal: createTerminalTestContext(["ctrl+c"]),
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toStrictEqual(
        new CommandFailed({ command: "rule test add", exitCode: ChildProcessSpawner.ExitCode(1) })
      )
      expect(logLines).toStrictEqual(["\n■ No rule test was added."])
      expect(files.list()).toStrictEqual([".adamantite/lint/no-debugger.ts"])
    })
  )

  it.effect("list rules without writing a file when the terminal is not interactive", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ".adamantite/lint/no-debugger.ts": "// rule\n" },
      })

      const logLines: unknown[] = []

      const exit = yield* runCommand(ruleCommand, ["test", "add"], {
        files,
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "no-debugger",
        "● Pass a rule name with `adamantite rule test add <name>`.",
      ])
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
        ["test", "add", "no-debugger", "--path", "tests/lint/no-debugger.test.ts"],
        { files }
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

      const logLines: unknown[] = []
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test", "add", "no-debugger"], {
        files,
        layers: [runner.layer],
        logLines,
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

      const exit = yield* runCommand(ruleCommand, ["test", "add", "no-debugger"], {
        files,
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toBeInstanceOf(CustomRuleNotFound)
      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
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

      const exit = yield* runCommand(ruleCommand, ["test", "add", "no-debugger"], {
        files,
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toBeInstanceOf(CustomRuleExists)
      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
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
        ["test", "add", "no-window", "--dir", "tooling/lint"],
        { files }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read("tooling/lint/no-window.test.ts")).toContain(
        'import rule from "./no-window.mjs"'
      )
      expect(files.exists(".adamantite")).toBe(false)
    })
  )

  it.effect("read --dir and --path before the name, and tell how to run the test", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "tooling/lint/no-window.ts": "// rule\n" },
      })

      const logLines: unknown[] = []
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(
        ruleCommand,
        ["test", "add", "--dir", "tooling/lint", "--path", "tests/no-window.test.ts", "no-window"],
        { files, layers: [runner.layer], logLines }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read("tests/no-window.test.ts")).toContain(
        'import rule from "../tooling/lint/no-window.ts"'
      )
      expect(files.list()).toStrictEqual(["tests/no-window.test.ts", "tooling/lint/no-window.ts"])
      expect(runner.invocations).toStrictEqual([])
      expect(logLines).toStrictEqual([
        "✔ Wrote tests/no-window.test.ts.",
        "● Adapt the valid and invalid cases to the rule, then run `adamantite rule test` with `--path` and the test file path.",
        "● RuleTester uses node:test. Exclude this test from Vitest and Jest discovery. See Custom rules in the Adamantite README.",
      ])
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
          layers: [runner.layer],
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
        layers: [runner.layer],
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
        layers: [runner.layer],
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
        layers: [createRunnerTestContext([1]).layer],
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toBeInstanceOf(CommandFailed)
      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
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

      const logLines: unknown[] = []
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [runner.layer],
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "▲ `rule test` cannot read the `dir` of a `custom()` call in `oxlint.config.ts`, because it is not a string literal. It does not run the tests of that rules folder.",
        "🧪 Testing custom rules · adamantite (node)",
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

      const logLines: unknown[] = []
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [runner.layer],
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([])
      expect(logLines).toStrictEqual([
        "▲ `rule test` cannot resolve the import of `./tooling/missing.ts` in `oxlint.config.ts`, so it does not run the tests of the rules folders behind it.",
        "● No tests were found for loaded custom rules. Run `adamantite doctor` to check rule setup, or `adamantite rule test add` to add a test.",
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
      const logLines: unknown[] = []
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(ruleCommand, ["test"], {
        files,
        layers: [runner.layer],
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([])
      expect(logLines).toStrictEqual([
        "● No tests were found for loaded custom rules. Run `adamantite doctor` to check rule setup, or `adamantite rule test add` to add a test.",
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

      const logLines: unknown[] = []

      const exit = yield* runCommand(ruleCommand, ["ast", "src/value.ts"], {
        files,
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)

      const [output] = logLines

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

      const logLines: unknown[] = []

      const exit = yield* runCommand(ruleCommand, ["ast", "src/broken.ts"], {
        files,
        logLines,
      })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toBeInstanceOf(FailedToParseSource)
      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        path: `${files.root}/src/broken.ts`,
      })
      expect(logLines).toStrictEqual([])
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
      renderTrial(
        "no-restricted-imports",
        new ErrorSetting({ options: [{ paths: ["node:fs"] }] }),
        [
          { case: reportCase, config: "oxlint.config.ts", diagnostics: [report] },
          { case: acceptCase, config: "oxlint.config.ts", diagnostics: [report] },
        ]
      )
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
      renderTrial("no-console", new CurrentSetting(), [
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
      message: "Invalid trial options. Give `--options` or `--current`, not both.",
      name: "reject --current with --options",
    },
    {
      args: ["--report", "../cart.ts"],
      message:
        "Invalid case `../cart.ts`. The path must be a file inside the project, relative to the project root.",
      name: "reject a case outside the project",
    },
  ])("$name with exit code 2 before it copies the project", ({ args, message }) =>
    Effect.gen(function* () {
      const logLines: unknown[] = []

      // The test spawner dies on each process, so the error comes before the copy.
      const exit = yield* runCommand(ruleCommand, ["try", "no-console", ...args], {
        files: createFileSystemTestContext(),
        logLines,
      })

      const failure = Option.getOrThrow(Exit.findErrorOption(exit))

      // Exit code 1 means that a case differs, so an input that checks no case must not use it.
      expect(failure).toStrictEqual(
        new CommandFailed({ command: "rule try", exitCode: ChildProcessSpawner.ExitCode(2) })
      )
      expect(logLines).toStrictEqual([`✖ ${message}`])
    })
  )
})
