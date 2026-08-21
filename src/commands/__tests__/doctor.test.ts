import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import doctorCommand from "#commands/doctor.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import { AgentRunner } from "#lib/workspace/agent-runner.ts"
import { GitStatus } from "#lib/workspace/git-status.ts"
import { toKnipTsConfigContent } from "#lib/workspace/tooling/knip.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { createPrompterTestContext, runCommand } from "./command-test-helpers.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

describe("doctor", () => {
  it.effect("report success when no managed integration applies", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "No applicable integrations found.",
      })
    })
  )

  it.effect("fail when Adamantite is not installed", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({}) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("report findings and exit 1", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "1. Missing knip configuration",
      })
    })
  )

  it.effect("report success when managed state meets the oracle", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "knip.config.ts": toKnipTsConfigContent(),
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({ level: "success", message: "No issues found." })
    })
  )

  it.effect("keep --fix parseable with a replacement error", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, ["--fix"], {
        files,
        layers: [prompter.layer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "error",
        message:
          "`doctor --fix` has been removed. Run `adamantite doctor` and follow the reported goal criteria.",
      })
    })
  )

  it.effect("print and copy the combined prompt in an interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const copied: string[] = []
      const prompter = createPrompterTestContext({ selectResponses: ["prompt"] })
      const interactive = Layer.succeed(TerminalCapabilities)({
        copyToClipboard: (content) => Effect.sync(() => copied.push(content)),
        isInteractive: Effect.succeed(true),
      })
      const agentRunner = Layer.succeed(AgentRunner)({
        detect: () => Effect.succeed([]),
        getCommand: () => ({ args: [], command: "codex" }),
        run: () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [
          prompter.layer,
          interactive,
          agentRunner,
          Layer.succeed(GitStatus)({ isDirty: () => Effect.succeed(false) }),
        ],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(copied).toHaveLength(1)
      expect(copied[0]).toContain("# Adamantite doctor findings")
      expect(copied[0]).toContain("Do not suppress or work around checks")
    })
  )

  it.effect("reassess once after an agent reaches the goal state", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext({ selectResponses: ["codex"] })
      const interactive = Layer.succeed(TerminalCapabilities)({
        copyToClipboard: () => Effect.void,
        isInteractive: Effect.succeed(true),
      })
      const agentRunner = Layer.succeed(AgentRunner)({
        detect: () => Effect.succeed(["codex"]),
        getCommand: () => ({ args: ["exec", "prompt"], command: "codex" }),
        run: () =>
          Effect.sync(() => {
            files.write("knip.config.ts", toKnipTsConfigContent())
            return ChildProcessSpawner.ExitCode(0)
          }),
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [
          prompter.layer,
          interactive,
          agentRunner,
          Layer.succeed(GitStatus)({ isDirty: () => Effect.succeed(false) }),
        ],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "The agent resolved every finding.",
      })
    })
  )

  it.effect("use a safe warning when the working tree is not confirmed clean", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext({
        confirmResponses: [false],
        selectResponses: ["codex"],
      })
      const interactive = Layer.succeed(TerminalCapabilities)({
        copyToClipboard: () => Effect.void,
        isInteractive: Effect.succeed(true),
      })
      const agentRunner = Layer.succeed(AgentRunner)({
        detect: () => Effect.succeed(["codex"]),
        getCommand: () => ({ args: ["exec", "prompt"], command: "codex" }),
        run: () => Effect.succeed(ChildProcessSpawner.ExitCode(0)),
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [
          prompter.layer,
          interactive,
          agentRunner,
          Layer.succeed(GitStatus)({ isDirty: () => Effect.succeed(true) }),
        ],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Adamantite could not confirm a clean working tree. The agent can overwrite or mix with existing changes.",
      })
    })
  )

  it.effect("report a nonzero agent exit and surviving findings", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext({ selectResponses: ["codex"] })
      const interactive = Layer.succeed(TerminalCapabilities)({
        copyToClipboard: () => Effect.void,
        isInteractive: Effect.succeed(true),
      })
      const agentRunner = Layer.succeed(AgentRunner)({
        detect: () => Effect.succeed(["codex"]),
        getCommand: () => ({ args: ["exec", "prompt"], command: "codex" }),
        run: () => Effect.succeed(ChildProcessSpawner.ExitCode(7)),
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [
          prompter.layer,
          interactive,
          agentRunner,
          Layer.succeed(GitStatus)({ isDirty: () => Effect.succeed(false) }),
        ],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "codex did not complete the requested repair.",
      })
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Findings remain after the agent run.",
      })
    })
  )

  it.effect("keep exit 1 when an agent applies only a partial repair", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "knip.json": "{}\n",
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })
      const prompter = createPrompterTestContext({ selectResponses: ["codex"] })
      const interactive = Layer.succeed(TerminalCapabilities)({
        copyToClipboard: () => Effect.void,
        isInteractive: Effect.succeed(true),
      })
      const agentRunner = Layer.succeed(AgentRunner)({
        detect: () => Effect.succeed(["codex"]),
        getCommand: () => ({ args: ["exec", "prompt"], command: "codex" }),
        run: () =>
          Effect.sync(() => {
            files.write("knip.config.ts", toKnipTsConfigContent())
            return ChildProcessSpawner.ExitCode(0)
          }),
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [
          prompter.layer,
          interactive,
          agentRunner,
          Layer.succeed(GitStatus)({ isDirty: () => Effect.succeed(false) }),
        ],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Findings remain after the agent run.",
      })
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "1. Legacy knip files remain",
      })
    })
  )
})
