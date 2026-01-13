import process from "node:process"
import type { PackageManagerName } from "nypm"
import { Context, Effect, Layer } from "effect"
import { detectPackageManager } from "nypm"
import { NoPackageManager } from "#errors.ts"
import { Prompter, PrompterLive } from "./prompter"

type PackageManagerCommand =
  | readonly ["bunx"]
  | readonly ["pnpm", "dlx"]
  | readonly ["yarn", "dlx"]
  | readonly ["npx"]
  | readonly ["deno", "run", "-A"]

export class PackageManager extends Context.Tag("PackageManager")<
  PackageManager,
  {
    readonly name: PackageManagerName
    readonly command: PackageManagerCommand
  }
>() {}

export const PackageManagerLive = Layer.effect(
  PackageManager,
  Effect.gen(function* () {
    const prompter = yield* Prompter
    const result = yield* Effect.tryPromise({
      catch: (cause) => new NoPackageManager({ cause }),
      try: () => detectPackageManager(process.cwd()),
    })

    if (!result?.name) {
      return yield* Effect.fail(new NoPackageManager({}))
    }

    if (result.warnings?.length) {
      for (const warning of result.warnings) {
        yield* prompter.log.warning(warning)
      }
    }

    const command = (() => {
      switch (result.name) {
        case "bun":
          return ["bunx"] as const
        case "pnpm":
          return ["pnpm", "dlx"] as const
        case "yarn":
          return ["yarn", "dlx"] as const
        case "npm":
          return ["npx"] as const
        case "deno":
          return ["deno", "run", "-A"] as const
        default:
          return ["npx"] as const
      }
    })()

    return {
      command,
      name: result.name,
    }
  })
).pipe(Layer.provide(PrompterLive))
