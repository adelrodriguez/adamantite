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
      "node_modules/@effect/tsgo/package.json": JSON.stringify({
        bin: { "effect-tsgo": "./dist/effect-tsgo.cjs" },
      }),
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
      expect(runner.invocations.map((invocation) => invocation.args.slice(1))).toEqual([
        ["patch", "--oxlint", "--typescript"],
      ])
      expect(prompter.logs).toContainEqual({ level: "success", message: "Prepared @effect/tsgo." })
    })
  )

  it.effect("do nothing when no managed plugin has a prepare step that applies", () =>
    Effect.gen(function* () {
      const runner = createRunnerTestContext()

      for (const files of [
        makeFiles(["shadcn"]),
        makeFiles(["effect"], { scripts: { check: "oxlint" } }),
      ]) {
        const exit = yield* runCommand(prepareCommand, [], {
          files,
          layers: [createPrompterTestContext().layer, runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
      }

      expect(runner.invocations).toEqual([])
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
