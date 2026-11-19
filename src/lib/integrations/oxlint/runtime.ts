import process from "node:process"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import {
  BackendOverride,
  BindingOverride,
  NativeRuntime,
} from "#lib/integrations/oxlint/plugins/base.ts"
import { oxlintPlugins } from "#lib/integrations/oxlint/plugins/index.ts"
import { resolvePackageDirectory } from "#lib/project/module-resolver.ts"
import { PackageNotInstalled } from "#lib/shared/errors.ts"

export class StockPart extends Data.TaggedClass("Stock") {}

export class ReplacedPart extends Data.TaggedClass("Replaced")<{
  readonly env: Readonly<Record<string, string>>
  readonly preload: string
}> {}

export type RuntimePart = StockPart | ReplacedPart

export class NoBackend extends Data.TaggedClass("None") {}

export class TsrsBackend extends Data.TaggedClass("Tsrs")<{ readonly launcher: string }> {}

export class ReplacedBackend extends Data.TaggedClass("Replaced")<{
  readonly env: Readonly<Record<string, string>>
}> {}

type RuntimeBackend = NoBackend | ReplacedBackend | TsrsBackend

export function toBackendEnv(
  backend: RuntimeBackend,
  platform = process.platform
): Readonly<Record<string, string | undefined>> {
  return Match.valueTags(backend, {
    None: () => ({}),
    Replaced: ({ env }) => env,
    // Oxlint 1.92 and later find the launcher with the same search as `findLauncher`, and start it
    // as `<path> headless`. Only when that search finds nothing does Oxlint also look on `PATH`.
    // The `tsrs-lint` bin adds the `--lint` flag of tsrs. Windows still names the launcher, because
    // no Windows run has confirmed that search. Elsewhere, the tsrs backend owns the variable, so an
    // inherited path, such as one to an old tsgolint, must not win over that search.
    Tsrs: ({ launcher }) => ({
      OXLINT_TSGOLINT_PATH: platform === "win32" ? launcher : undefined,
    }),
  })
}

export interface OxlintRuntime {
  readonly backend: RuntimeBackend
  readonly binding: RuntimePart
  readonly oxlint: string
}

export interface OxlintLaunch {
  readonly cli: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly preload: Option.Option<string>
}

export const toLaunch = Effect.fn("toLaunch")(function* (
  { backend, binding, oxlint }: OxlintRuntime,
  platform: NodeJS.Platform = process.platform
) {
  const path = yield* Path.Path
  const cli = path.join(oxlint, "dist", "cli.js")
  const backendEnv = toBackendEnv(backend, platform)

  return Match.valueTags(binding, {
    Replaced: ({ env, preload }) => ({
      cli,
      env: { ...backendEnv, ...env },
      preload: Option.some(preload),
    }),
    Stock: () => ({ cli, env: backendEnv, preload: Option.none<string>() }),
  }) satisfies OxlintLaunch
})

// Oxlint looks for its backend in each `node_modules/.bin` folder from the project up to the root,
// and then on `PATH`. A workspace package often uses the launcher of the root installation.
const findLauncher = Effect.fn("findLauncher")(function* (project: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  // The launchers that package managers write for the `tsrs-lint` bin. Windows cannot start the bin
  // script itself, so it gets `.cmd` from npm and pnpm, and `.exe` from Bun.
  const launchers =
    process.platform === "win32" ? ["tsrs-lint.cmd", "tsrs-lint.exe"] : ["tsrs-lint"]

  const candidates: string[] = []

  for (let folder = project; ; folder = path.dirname(folder)) {
    candidates.push(...launchers.map((name) => path.join(folder, "node_modules", ".bin", name)))

    if (path.dirname(folder) === folder) {
      break
    }
  }

  return yield* Effect.findFirst(candidates, (candidate) =>
    fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))
  )
})

const resolveDefaultBackend = Effect.fn("resolveDefaultBackend")(function* (project: string) {
  return Option.match(yield* findLauncher(project), {
    onNone: (): RuntimeBackend => new NoBackend(),
    onSome: (file): RuntimeBackend => new TsrsBackend({ launcher: file }),
  })
})

export const resolveOxlintRuntime = Effect.fn("resolveOxlintRuntime")(function* (project: string) {
  const oxlint = yield* resolvePackageDirectory(project, "oxlint")

  if (Option.isNone(oxlint)) {
    return yield* new PackageNotInstalled({ packageName: "oxlint", project })
  }

  const overrides = yield* Effect.forEach(
    oxlintPlugins.flatMap(({ runtime }) => (runtime instanceof NativeRuntime ? [runtime] : [])),
    (runtime) => runtime.resolve(project, oxlint.value),
    { concurrency: "unbounded" }
  )

  const binding = overrides.flat().find((override) => override instanceof BindingOverride)
  const backend = overrides.flat().find((override) => override instanceof BackendOverride)

  return {
    backend:
      backend === undefined
        ? yield* resolveDefaultBackend(project)
        : new ReplacedBackend({ env: backend.env }),
    binding:
      binding === undefined
        ? new StockPart()
        : new ReplacedPart({ env: binding.env, preload: binding.preload }),
    oxlint: oxlint.value,
  } satisfies OxlintRuntime
})
