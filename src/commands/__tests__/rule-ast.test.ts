import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import process from "node:process"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Command from "effect/cli/Command"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { TestConsole } from "effect/testing"
import ruleCommand, { AstReport } from "#commands/rule.ts"
import { getOxlintCommand } from "#lib/integrations/oxlint/entry.ts"
import { OxlintCommand } from "#lib/integrations/oxlint/files.ts"
import { OxlintProbe } from "#lib/integrations/oxlint/probe.ts"
import { ConfigLoader } from "#lib/project/config-loader.ts"
import { CommandRunner } from "#lib/shared/command-runner.ts"
import { FailedToParseSource } from "#lib/shared/errors.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")

// The Oxlint package folder of the project. CI sets `ADAMANTITE_TEST_OXLINT` to run the probe with
// the minimum Oxlint version that `peerDependencies` allows.
const OXLINT_OVERRIDE = process.env["ADAMANTITE_TEST_OXLINT"]

const TEST_OXLINT =
  OXLINT_OVERRIDE === undefined || OXLINT_OVERRIDE === ""
    ? join(REPO_ROOT, "node_modules/oxlint")
    : OXLINT_OVERRIDE

// The build writes the Oxlint entry and the probe beside the CLI, so a run from source starts their
// source.
const TEST_LAYER = Layer.mergeAll(
  NodeServices.layer,
  TestConsole.layer,
  CommandRunner.layer.pipe(Layer.provide(NodeServices.layer)),
  ConfigLoader.layer.pipe(Layer.provide(NodeServices.layer)),
  Layer.succeed(OxlintCommand)((project) => ({
    ...getOxlintCommand(project),
    args: [join(REPO_ROOT, "src/oxlint.ts")],
  })),
  Layer.succeed(OxlintProbe)(join(REPO_ROOT, "src/probe.ts")),
  Layer.succeed(TerminalCapabilities.TerminalCapabilities)({
    canAnimate: false,
    canColor: false,
    canPrompt: false,
  })
)

describe("rule ast", () => {
  let project: string

  function write(file: string, content: string) {
    mkdirSync(dirname(join(project, file)), { recursive: true })
    writeFileSync(join(project, file), content)
  }

  // `rule ast` reads the file from the current directory, as the CLI does.
  function runAst(args: readonly string[]) {
    const cwd = process.cwd()

    return Effect.acquireUseRelease(
      Effect.sync(() => {
        process.chdir(project)
      }),
      () =>
        Command.runWith(ruleCommand, { version: "test" })(["ast", ...args]).pipe(
          Effect.exit,
          Effect.flatMap((exit) =>
            TestConsole.logLines.pipe(Effect.map((logLines) => ({ exit, logLines })))
          )
        ),
      () =>
        Effect.sync(() => {
          process.chdir(cwd)
        })
    ).pipe(Effect.provide(TEST_LAYER))
  }

  beforeEach(() => {
    project = realpathSync(mkdtempSync(join(tmpdir(), "adamantite-rule-ast-")))
    mkdirSync(join(project, "node_modules"))
    symlinkSync(TEST_OXLINT, join(project, "node_modules/oxlint"))
    write("package.json", JSON.stringify({ name: "app", type: "module" }))
    // The project config does not apply to the tree, so a rule that it turns on reports nothing.
    write("oxlint.config.ts", 'export default { rules: { "no-debugger": "error" } }\n')
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it.live("print the tree that Oxlint gives rules, without parenthesized expressions", () =>
    Effect.gen(function* () {
      // JSON has no bigint, so the tree writes the digits of `1n`.
      write(
        "src/value.ts",
        "debugger\nexport const value = (1 + 2) as number\nexport const big = 1n\n"
      )

      const { exit, logLines } = yield* runAst(["src/value.ts"])

      const [output = ""] = logLines.filter(Predicate.isString)

      expect({ lines: logLines.length, succeeded: Exit.isSuccess(exit) }).toStrictEqual({
        lines: 1,
        succeeded: true,
      })
      expect(output).toContain('"type": "TSAsExpression"')
      expect(output).toContain('"type": "BinaryExpression"')
      expect(output).not.toMatch(/ParenthesizedExpression|"parent"/u)
    })
  )

  it.live("print the file and its tree as JSON that decodes with the report schema", () =>
    Effect.gen(function* () {
      // A disable comment does not hide the tree.
      write("src/value.ts", "/* oxlint-disable */\nexport const value = 1 // oxlint-disable-line\n")

      const { exit, logLines } = yield* runAst(["src/value.ts", "--json"])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines).toHaveLength(1)
      expect(
        yield* Schema.decodeUnknownEffect(Schema.fromJsonString(AstReport))(logLines[0])
      ).toMatchObject({
        file: "src/value.ts",
        program: { body: [{ type: "ExportNamedDeclaration" }], type: "Program" },
        schemaVersion: 1,
      })
    })
  )

  it.live("fail with the parse errors of a file that does not parse", () =>
    Effect.gen(function* () {
      write("src/broken.ts", "export const = 1\n")

      const { exit, logLines } = yield* runAst(["src/broken.ts"])
      const failure = Option.getOrThrow(Exit.findErrorOption(exit))

      expect(failure).toBeInstanceOf(FailedToParseSource)
      expect(failure).toMatchObject({ path: "src/broken.ts" })
      expect(logLines).toStrictEqual([])
    })
  )
})
