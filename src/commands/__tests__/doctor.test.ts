import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import doctorCommand from "#commands/doctor.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import { toKnipTsConfigContent } from "#lib/workspace/tooling/knip.ts"
import {
  createPrompterTestContext,
  createRunnerTestContext,
  runCommand,
} from "./command-test-helpers.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

function makeFindingsFixture() {
  return createFileSystemTestContext({
    files: {
      "package.json": manifest({
        devDependencies: { adamantite: "1.0.0", knip: knip.version },
        scripts: { analyze: "adamantite analyze" },
      }),
    },
  })
}

function success(stdout = "") {
  return {
    exitCode: ChildProcessSpawner.ExitCode(0),
    status: "exited" as const,
    stderr: "",
    stdout,
  }
}

describe("doctor", () => {
  it.effect("print Markdown and exit 1 in a non-interactive run without --agent", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages[0]).toContain("# Adamantite doctor findings")
    })
  )

  it.effect("repair findings headlessly and leave a second run clean", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const runner = createRunnerTestContext({
        captureImplementation: (options) =>
          Effect.sync(() => {
            if (options.command === "git" || options.args[0] === "--version") {
              return success()
            }
            files.write("knip.config.ts", toKnipTsConfigContent())
            return success()
          }),
      })

      const first = yield* runCommand(doctorCommand, ["--agent", "claude"], {
        files,
        layers: [runner.layer],
      })
      const second = yield* runCommand(doctorCommand, [], { files })

      expect(Exit.isSuccess(first)).toBe(true)
      expect(Exit.isSuccess(second)).toBe(true)
      expect(
        runner.invocations
          .filter((invocation) => invocation.command === "claude")
          .map((invocation) => invocation.args[0])
      ).toEqual(["--version", "-p"])
    })
  )

  it.effect("refuse a dirty non-interactive tree without --allow-dirty", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext({
        captureResults: [success("2.1.272 (Claude Code)\n"), success(" M package.json\n")],
      })

      const exit = yield* runCommand(doctorCommand, ["--agent", "claude"], {
        files,
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toContain(
        "The Git working tree has uncommitted changes. Pass --allow-dirty to let the agent edit it."
      )
      expect(runner.invocations.map((invocation) => invocation.command)).toEqual(["claude", "git"])
    })
  )

  it.effect("credit a timed-out attempt for findings it cleared", () =>
    Effect.gen(function* () {
      const files = makeFindingsFixture()
      const runner = createRunnerTestContext({
        captureImplementation: (options) =>
          Effect.sync(() => {
            if (options.args[0] === "--version") {
              return success()
            }
            if (options.command === "git") {
              return success(" M package.json\n")
            }
            files.write("knip.config.ts", toKnipTsConfigContent())
            return { exitCode: null, status: "timed-out" as const, stderr: "", stdout: "" }
          }),
      })

      const exit = yield* runCommand(doctorCommand, ["--agent", "claude", "--allow-dirty"], {
        files,
        layers: [runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
    })
  )
})
