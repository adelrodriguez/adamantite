import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import doctorCommand from "#commands/doctor.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import { toKnipTsConfigContent } from "#lib/workspace/tooling/knip.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { createPrompterTestContext, runCommand } from "./command-test-helpers.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

function makeInteractiveTerminalLayer() {
  return Layer.succeed(TerminalCapabilities)({
    copyToClipboard: () => Effect.void,
    isInteractive: Effect.succeed(true),
  })
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
      expect(prompter.logs).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("show no-applicable success framing in an interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "No applicable integrations found.",
      })
      expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
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
      expect(prompter.logs).toEqual([])
      expect(prompter.messages).toEqual([
        "`adamantite` is not installed in this project. Install it before running `adamantite doctor`.",
      ])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("show the missing-package failure in an interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({}) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "`adamantite` is not installed in this project. Install it before running `adamantite doctor`.",
      })
      expect(prompter.messages).toEqual([])
      expect(prompter.outros).toEqual(["⚠️ Doctor found issues."])
    })
  )

  it.effect("print the Markdown prompt directly in a non-interactive terminal", () =>
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
      expect(prompter.messages).toHaveLength(1)
      expect(prompter.messages[0]).toContain("# Adamantite doctor findings")
      expect(prompter.messages[0]).toContain("## 1. Missing knip configuration")
      expect(prompter.intros).toEqual([])
      expect(prompter.notes).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("keep assessment warnings out of the non-interactive Markdown output", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze", check: "adamantite check" },
            workspaces: ["packages/*"],
          }),
        },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, [], { files, layers: [prompter.layer] })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.messages).toHaveLength(1)
      expect(prompter.messages[0]).toContain("# Adamantite doctor findings")
      expect(prompter.logs).toEqual([])
      expect(prompter.outros).toEqual([])
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
      expect(prompter.logs).toEqual([])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("show success framing in an interactive terminal", () =>
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

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({ level: "success", message: "No issues found." })
      expect(prompter.outros).toEqual(["✅ Doctor completed successfully!"])
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
      expect(prompter.logs).toEqual([])
      expect(prompter.messages).toEqual([
        "`doctor --fix` has been removed. Run `adamantite doctor` and follow the reported goal criteria.",
      ])
      expect(prompter.outros).toEqual([])
    })
  )

  it.effect("show the removed-fix failure in an interactive terminal", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }) },
      })
      const prompter = createPrompterTestContext()

      const exit = yield* runCommand(doctorCommand, ["--fix"], {
        files,
        layers: [prompter.layer, makeInteractiveTerminalLayer()],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "error",
        message:
          "`doctor --fix` has been removed. Run `adamantite doctor` and follow the reported goal criteria.",
      })
      expect(prompter.messages).toEqual([])
      expect(prompter.outros).toEqual(["❌ Doctor did not run"])
    })
  )

  it.effect("show formatted findings and copy the Markdown prompt", () =>
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
      const prompter = createPrompterTestContext({ confirmResponses: [true] })
      const interactive = Layer.succeed(TerminalCapabilities)({
        copyToClipboard: (content) => Effect.sync(() => copied.push(content)),
        isInteractive: Effect.succeed(true),
      })

      const exit = yield* runCommand(doctorCommand, [], {
        files,
        layers: [prompter.layer, interactive],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.notes).toEqual([
        expect.objectContaining({
          message: expect.stringContaining(
            "Current state\nThe managed `knip.config.ts` file is missing."
          ),
          title: "1. Missing knip configuration",
        }),
      ])
      expect(prompter.logs).toContainEqual({
        level: "info",
        message:
          "To hand off these findings, start a coding agent in this project and ask it to run `adamantite doctor`.",
      })
      expect(prompter.confirmCalls).toContainEqual({
        initialValue: true,
        message: "Copy the Markdown prompt for a coding agent?",
      })
      expect(copied).toHaveLength(1)
      expect(copied[0]).toContain("# Adamantite doctor findings")
      expect(copied[0]).toContain("Do not suppress or work around checks")
      expect(prompter.messages).toHaveLength(1)
      expect(prompter.messages[0]).toContain("# Adamantite doctor findings")
      expect(prompter.messages[0]).toContain("Do not suppress or work around checks")
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "The Markdown prompt was printed and sent to the terminal clipboard.",
      })
    })
  )
})
