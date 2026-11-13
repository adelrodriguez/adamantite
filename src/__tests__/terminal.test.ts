import { describe, expect, it } from "@effect/vitest"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Terminal from "effect/Terminal"
import { createTerminalTestContext, type TestKey } from "#__tests__/terminal.ts"

function runPrompt<A>(prompt: Prompt.Prompt<A>, keys: readonly TestKey[]) {
  const terminal = createTerminalTestContext(keys)

  return Prompt.run(prompt).pipe(
    Effect.exit,
    Effect.map((exit) => ({ exit, output: terminal.output() })),
    Effect.provide([
      terminal.layer,
      FileSystem.layerNoop({}),
      Path.layer,
      Layer.succeed(Prompt.Theme)(Prompt.makeTheme({ colors: false })),
    ])
  )
}

describe("createTerminalTestContext", () => {
  it.effect("answer a prompt with the queued keys and record what it displays", () =>
    Effect.gen(function* () {
      const { exit, output } = yield* runPrompt(
        Prompt.Select({
          choices: [
            { title: "no-debugger", value: "no-debugger" },
            { title: "no-window", value: "no-window" },
          ],
          message: "Which rule needs a test?",
        }),
        ["down", "enter"]
      )

      expect(exit).toStrictEqual(Exit.succeed("no-window"))
      expect(output).toContain("✔ Which rule needs a test? …  no-window")
    })
  )

  it.effect("fail the prompt with QuitError for ctrl+c", () =>
    Effect.gen(function* () {
      const { exit } = yield* runPrompt(Prompt.Confirm({ initial: true, message: "Continue?" }), [
        "ctrl+c",
      ])

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toBeInstanceOf(Terminal.QuitError)
    })
  )

  it.effect("kill the prompt that runs after the last queued key", () =>
    Effect.gen(function* () {
      const { exit } = yield* runPrompt(Prompt.Confirm({ initial: true, message: "Continue?" }), [])

      expect(Exit.hasDies(exit)).toBe(true)
    })
  )
})
