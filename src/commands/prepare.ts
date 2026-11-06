import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"

// `adamantite prepare` patched Oxlint for the effect preset after each install. The Oxlint proxy
// replaced the patch, so the command does nothing. It stays until #444, because existing `prepare`
// scripts still run it, and Doctor tells those projects to remove it.
export default Command.make("prepare").pipe(
  Command.withDescription("Do nothing. Remove `adamantite prepare` from the `prepare` script"),
  Command.withHandler(() => Effect.void)
)
