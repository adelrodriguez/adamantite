import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Terminal from "effect/Terminal"

export const printTitle = () =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal
    const terminalColumns = yield* terminal.columns

    const title = `
                .o8                                                        .    o8o      .
               "888                                                      .o8    \`"'    .o8
 .oooo.    .oooo888   .oooo.   ooo. .oo.  .oo.    .oooo.   ooo. .oo.   .o888oo oooo  .o888oo  .ooooo.
\`P  )88b  d88' \`888  \`P  )88b  \`888P"Y88bP"Y88b  \`P  )88b  \`888P"Y88b    888   \`888    888   d88' \`88b
 .oP"888  888   888   .oP"888   888   888   888   .oP"888   888   888    888    888    888   888ooo888
d8(  888  888   888  d8(  888   888   888   888  d8(  888   888   888    888 .  888    888 . 888    .o
\`Y888""8o \`Y8bod88P" \`Y888""8o o888o o888o o888o \`Y888""8o o888o o888o   "888" o888o   "888" \`Y8bod8P'
`

    const columns = title.split("\n").reduce((max, line) => Math.max(max, line.trim().length), 0)

    if (!terminalColumns || terminalColumns < columns) {
      return
    }

    yield* Console.info(title)
  })
