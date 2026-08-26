import process from "node:process"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

interface TerminalCapabilitiesService {
  readonly copyToClipboard: (content: string) => Effect.Effect<void>
  readonly isInteractive: Effect.Effect<boolean>
}

export class TerminalCapabilities extends Context.Service<
  TerminalCapabilities,
  TerminalCapabilitiesService
>()("TerminalCapabilities") {
  static readonly layer = Layer.succeed(this)({
    copyToClipboard: (content) =>
      Effect.sync(() => {
        const encoded = Buffer.from(content).toString("base64")
        process.stdout.write(`\u001B]52;c;${encoded}\u0007`)
      }),
    isInteractive: Effect.sync(() => process.stdin.isTTY && process.stdout.isTTY),
  })
}
