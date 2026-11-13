import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  createDependencyInstallerTestContext,
  runCommand,
} from "#commands/__tests__/command-test-helpers.ts"
import initCommand from "#commands/init/index.ts"
import { formatInitCommand } from "#lib/workspace/init-command.ts"

describe("formatInitCommand", () => {
  it.effect.each([
    { agents: true, scripts: ["analyze", "check"] as const },
    { editors: ["zed"], scripts: ["check"] as const },
    { editors: ["vscode"], scripts: ["check"] as const },
    { scripts: ["analyze"] as const },
  ])("write a repair command that init accepts: %o", (setup) =>
    Effect.gen(function* () {
      const command = formatInitCommand(setup)
      const files = createFileSystemTestContext({ files: { "package.json": "{}" } })
      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()

      expect(command.startsWith("adamantite init ")).toBe(true)

      const exit = yield* runCommand(
        initCommand,
        command.slice("adamantite init ".length).split(" "),
        { files, layers: [installer.layer], logLines }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
    })
  )
})
