import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"

export const content = FileSystem.FileSystem.pipe(
  Effect.flatMap((fs) => fs.readFileString("package.json")),
  Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(""))
)
