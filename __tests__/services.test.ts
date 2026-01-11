import { describe, expect, test } from "bun:test"
import { FileSystem } from "@effect/platform"
import * as NodeContext from "@effect/platform-node/NodeContext"
import { Effect, Layer } from "effect"
import { Cwd, CwdLive } from "#services/cwd.ts"
import { Prompter, PrompterLive } from "#services/prompter.ts"
import { readPackageJson, checkIsMonorepo } from "#utils.ts"

describe("services", () => {
  describe("Prompter", () => {
    test("should use live implementation by default", async () => {
      const program = Effect.gen(function* () {
        const prompter = yield* Prompter
        yield* prompter.intro("Test intro")
        yield* prompter.log.info("Test info")
        yield* prompter.log.success("Test success")
        yield* prompter.outro("Test outro")
      })

      await program.pipe(
        Effect.provide(PrompterLive),
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      // If we get here without errors, the live implementation works
      expect(true).toBe(true)
    })

    test("should allow mocking prompts for testing", async () => {
      const PrompterTest = Layer.succeed(Prompter, {
        cancel: () => Effect.void,
        confirm: () => Effect.succeed(true),
        intro: () => Effect.void,
        log: {
          error: () => Effect.void,
          info: () => Effect.void,
          success: () => Effect.void,
          warning: () => Effect.void,
        },
        // @ts-expect-error - mock implementation
        multiselect: () => Effect.succeed(["check", "fix"]),
        outro: () => Effect.void,
        spinner: () => ({
          cancel: () => false,
          clear: () => null,
          error: () => false,
          isCancelled: false,
          message: () => null,
          start: () => null,
          stop: () => null,
        }),
      })

      const program = Effect.gen(function* () {
        const prompter = yield* Prompter
        yield* prompter.intro("Test")
        const result = yield* prompter.confirm({ message: "Test?" })
        const selected = yield* prompter.multiselect({
          message: "Select options",
          options: [
            { label: "Check", value: "check" },
            { label: "Fix", value: "fix" },
          ],
        })
        yield* prompter.outro("Done")

        return { result, selected }
      })

      const result = await program.pipe(
        Effect.provide(PrompterTest),
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result.result).toBe(true)
      expect(result.selected).toEqual(["check", "fix"])
    })
  })

  describe("Cwd", () => {
    test("should use live implementation by default", async () => {
      const program = Effect.gen(function* () {
        const cwd = yield* Cwd
        const currentDir = yield* cwd.get
        return currentDir
      })

      const result = await program.pipe(
        Effect.provide(CwdLive),
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toBe(process.cwd())
    })

    test("should allow mocking cwd for testing", async () => {
      const testCwd = "/test/project"
      const CwdTest = Layer.succeed(Cwd, {
        get: Effect.succeed(testCwd),
      })

      const program = Effect.gen(function* () {
        const cwd = yield* Cwd
        const currentDir = yield* cwd.get
        return currentDir
      })

      const result = await program.pipe(
        Effect.provide(CwdTest),
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toBe(testCwd)
    })

    test("should work with readPackageJson when cwd is mocked", async () => {
      const testCwd = "/test/project"
      const CwdTest = Layer.succeed(Cwd, {
        get: Effect.succeed(testCwd),
      })

      const FileSystemTest = FileSystem.layerNoop({
        readFileString: () =>
          Effect.succeed(
            JSON.stringify({
              name: "test-project",
              version: "1.0.0",
            })
          ),
      })

      const program = readPackageJson()

      const result = await program.pipe(
        Effect.provide(CwdTest),
        Effect.provide(FileSystemTest),
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result.name).toBe("test-project")
      expect(result.version).toBe("1.0.0")
    })

    test("should work with checkIsMonorepo when cwd is mocked", async () => {
      const testCwd = "/test/project"
      const CwdTest = Layer.succeed(Cwd, {
        get: Effect.succeed(testCwd),
      })

      const FileSystemTest = FileSystem.layerNoop({
        exists: () => Effect.succeed(false),
        readFileString: () =>
          Effect.succeed(
            JSON.stringify({
              name: "test-project",
              version: "1.0.0",
              workspaces: ["packages/*"],
            })
          ),
      })

      const program = checkIsMonorepo()

      const result = await program.pipe(
        Effect.provide(CwdTest),
        Effect.provide(FileSystemTest),
        Effect.provide(NodeContext.layer),
        Effect.runPromise
      )

      expect(result).toBe(true)
    })
  })
})
