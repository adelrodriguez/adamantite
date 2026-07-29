import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import typecheckCommand from "#commands/typecheck.ts"
import {
  createPrompterTestContext,
  createRunnerTestContext,
  runCommand,
} from "./command-test-helpers.ts"

describe("typecheck", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-typecheck-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("run oxlint with config-driven checks and log deprecation warning", async () => {
    const prompter = createPrompterTestContext()
    const runner = createRunnerTestContext()

    const exit = await runCommand(typecheckCommand, [], [prompter.layer, runner.layer])

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(prompter.logs).toContainEqual({
      level: "warning",
      message: "Deprecated. Use `adamantite check` for typechecking.",
    })
    expect(runner.invocations).toEqual([
      {
        args: [],
        command: "oxlint",
      },
    ])
  })

  test("forward arguments to oxlint", async () => {
    const prompter = createPrompterTestContext()
    const runner = createRunnerTestContext()

    const exit = await runCommand(
      typecheckCommand,
      [],
      [prompter.layer, runner.layer],
      ["--deny-warnings"]
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(runner.invocations[0]?.args).toEqual(["--deny-warnings"])
  })

  test("fail with CommandFailed when the runner returns a non-zero exit code", async () => {
    const prompter = createPrompterTestContext()
    const runner = createRunnerTestContext([1])

    const exit = await runCommand(typecheckCommand, [], [prompter.layer, runner.layer])

    expect(Exit.isFailure(exit)).toBe(true)
    const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
    expect(error._tag).toBe("CommandFailed")
  })
})
