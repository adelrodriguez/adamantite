import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import prepareCommand from "#commands/prepare.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import {
  createPrompterTestContext,
  createRunnerTestContext,
  runCommand,
} from "./command-test-helpers.ts"

function makeFiles(presets: string[], packageJson: PackageJson = {}) {
  return createFileSystemTestContext({
    files: {
      "oxlint.config.ts": toOxlintTsConfigContent(presets),
      "package.json": JSON.stringify({
        name: "test-project",
        scripts: { check: "adamantite check", prepare: "adamantite prepare" },
        ...packageJson,
      }),
    },
  })
}

describe("prepare", () => {
  it.effect("patch for the effect preset", () =>
    Effect.gen(function* () {
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(prepareCommand, [], {
        files: makeFiles(["effect"]),
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([
        expect.objectContaining({
          args: ["patch", "--oxlint", "--typescript"],
          command: "effect-tsgo",
          stderr: "inherit",
          stdout: "inherit",
        }),
      ])
    })
  )

  it.effect("patch for the effect preset with a custom lint script", () =>
    Effect.gen(function* () {
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(prepareCommand, [], {
        files: makeFiles(["effect"], { scripts: { check: "oxlint" } }),
        layers: [createPrompterTestContext().layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toHaveLength(1)
    })
  )

  it.effect("do nothing without the effect preset", () =>
    Effect.gen(function* () {
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(prepareCommand, [], {
        files: makeFiles(["shadcn"]),
        layers: [createPrompterTestContext().layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([])
    })
  )

  it.effect("fail when the patch fails, so the install fails", () =>
    Effect.gen(function* () {
      const exit = yield* runCommand(prepareCommand, [], {
        files: makeFiles(["effect"]),
        layers: [createPrompterTestContext().layer, createRunnerTestContext([1]).layer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
    })
  )
})
