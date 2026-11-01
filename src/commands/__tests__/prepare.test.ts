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

describe("prepare", () => {
  it.effect("succeed and run nothing, also with the effect preset", () =>
    Effect.gen(function* () {
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(prepareCommand, [], {
        files: createFileSystemTestContext({
          files: {
            "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
            "package.json": JSON.stringify({
              name: "test-project",
              scripts: { check: "adamantite check", prepare: "adamantite prepare" },
            }),
          },
        }),
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toStrictEqual([])
      expect(prompter.logs).toStrictEqual([])
    })
  )
})
