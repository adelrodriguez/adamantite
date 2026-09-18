import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import fixCommand from "#commands/fix.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

describe("fix", () => {
  describe("agent mode", () => {
    it.effect("repair surviving diagnostics one file at a time", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            "package.json": JSON.stringify({
              devDependencies: { "oxlint-tsgolint": "0.0.0" },
            }),
          },
        })
        let report = 0
        const runner = createRunnerTestContext({
          captureImplementation: (options) =>
            Effect.sync(() => {
              if (options.command === "claude") {
                expect(options.args.join(" ")).toContain(
                  `Edit only ${join(files.root, "index.ts")}`
                )
                return {
                  exitCode: ChildProcessSpawner.ExitCode(0),
                  status: "exited" as const,
                  stderr: "",
                  stdout: "",
                }
              }
              report += 1
              return {
                exitCode: ChildProcessSpawner.ExitCode(report === 1 ? 1 : 0),
                status: "exited" as const,
                stderr: "",
                stdout: JSON.stringify({
                  diagnostics:
                    report === 1
                      ? [
                          {
                            code: "eslint(no-console)",
                            filename: "index.ts",
                            labels: [{ span: { column: 1, line: 1 } }],
                            message: "Unexpected console statement.",
                          },
                        ]
                      : [],
                }),
              }
            }),
          exitCodes: [1, 0, 1, 0],
        })

        const exit = yield* runCommand(fixCommand, ["--agent", "claude"], {
          files,
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(
          runner.invocations.filter((invocation) => invocation.command === "claude")
        ).toHaveLength(1)
        expect(runner.invocations).toContainEqual(
          expect.objectContaining({
            args: expect.arrayContaining(["--type-aware", "--format", "json"]),
            command: "oxlint",
          })
        )
      })
    )
  })

  describe("default invocation", () => {
    it.effect("lint before formatting", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--fix"],
            command: "oxlint",
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write"],
            command: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )
  })

  describe("fix mode flags", () => {
    it.effect("add suggested fixes when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--suggested"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-suggestions"])
      })
    )

    it.effect("add dangerous fixes when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--dangerous"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-dangerously"])
      })
    )

    it.effect("add all fix modes when all is requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--all"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([
          "--fix",
          "--fix-suggestions",
          "--fix-dangerously",
        ])
      })
    )
  })

  describe("file arguments", () => {
    it.effect("deduplicate duplicate file arguments", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: { "index.ts": "export const value = 1\n" },
        })
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["index.ts", "index.ts"], {
          files,
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--fix", join(files.root, "index.ts")],
            command: "oxlint",
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write", join(files.root, "index.ts")],
            command: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after managed fix flags", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--dangerous"], {
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--fix", "--fix-dangerously", "--deny-warnings"],
            command: "oxlint",
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write"],
            command: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )
  })

  describe("error handling", () => {
    it.effect("run formatting after linting fails and report the first failure", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1, 2])

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed", command: "oxlint", exitCode: 1 })
        expect(runner.invocations).toHaveLength(2)
      })
    )

    it.effect("report a formatting failure after linting succeeds", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([0, 2])

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed", command: "oxfmt", exitCode: 2 })
      })
    )
  })
})
