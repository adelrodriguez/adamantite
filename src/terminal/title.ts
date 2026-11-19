import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Terminal from "effect/Terminal"
import { CurrentMode, is } from "#terminal/mode.ts"

import { getTitle } from "./title.macro.ts" with { type: "macro" }

const title = getTitle()

export const printTitle = Effect.gen(function* () {
  const mode = yield* CurrentMode

  if (!is("Menu")(mode)) {
    return
  }

  const terminal = yield* Terminal.Terminal
  const terminalColumns = yield* terminal.columns

  const columns = title.split("\n").reduce((max, line) => Math.max(max, line.trim().length), 0)

  if (!terminalColumns || terminalColumns < columns) {
    return
  }

  yield* Console.info(title)
})
