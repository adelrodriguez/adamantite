import type * as Effect from "effect/Effect"
import * as Context from "effect/Context"

/**
 * The keyboard input of the terminal. Prompts hold it in raw mode, and it stays open between
 * adjacent prompts.
 */
export class TerminalInput extends Context.Service<
  TerminalInput,
  {
    /**
     * Closes the input and turns raw mode off now. Call it before another process takes the
     * terminal, such as a coding agent, so a late release cannot change that process's terminal
     * mode. The next prompt opens the input again.
     */
    readonly release: Effect.Effect<void>
  }
>()("TerminalInput") {}
