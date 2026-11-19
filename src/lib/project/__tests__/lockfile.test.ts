import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection } from "#__tests__/lifecycle.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import {
  LOCKFILE_PATH,
  Lockfile,
  readLockfile,
  readSelection,
  renderLockfile,
  verifyLockfileVersion,
} from "#lib/project/lockfile.ts"
import { SetupAhead, SetupOutdated } from "#lib/shared/errors.ts"
import { stringifyJson } from "#lib/shared/json.ts"

function provideFiles(files: Record<string, string>) {
  const context = createFileSystemTestContext({ files })

  return Effect.provide(Layer.mergeAll(context.layer, Path.layer))
}

function makeLockfile(version: string) {
  return Option.some<Lockfile>({
    schemaVersion: 1,
    selection: makeSelection({}),
    version,
    written: {},
  })
}

function verify(
  lockfile: Option.Option<Lockfile>,
  options: { installed?: string; installedAt?: string; root?: string } = {}
) {
  const { installed, installedAt = "/project", root = "/project" } = options

  const files = createFileSystemTestContext({
    files:
      installed === undefined
        ? {}
        : {
            [`${installedAt.slice(1)}/node_modules/adamantite/package.json`]: JSON.stringify({
              name: "adamantite",
              version: installed,
            }),
          },
    root: "/",
  })

  const resolver = makeModuleResolverLayer(
    "/",
    installed === undefined
      ? {}
      : { "adamantite/lint": `${installedAt}/node_modules/adamantite/dist/presets/lint.js` }
  )

  return verifyLockfileVersion(root, lockfile).pipe(
    Effect.result,
    Effect.provide([files.layer, Path.layer, resolver])
  )
}

describe("lockfile", () => {
  it.effect.prop(
    "read back each lockfile that it renders",
    { lockfile: Lockfile },
    ({ lockfile }) =>
      Effect.gen(function* () {
        const content = yield* renderLockfile(lockfile)

        const read = yield* readLockfile("/project").pipe(
          provideFiles({ [LOCKFILE_PATH]: content })
        )

        // Generated objects have no prototype, so the test compares the rendered text.
        expect(yield* renderLockfile(Option.getOrThrow(read))).toBe(content)
      }),
    { arbitrary: { runs: 100 } }
  )

  it.effect.prop(
    "read no selection from JSON that is not a lockfile",
    { value: Schema.MutableJson },
    ({ value }) =>
      Effect.gen(function* () {
        const content = yield* stringifyJson(value)

        const selection = yield* readSelection("/project").pipe(
          provideFiles({ [LOCKFILE_PATH]: content })
        )

        expect(selection).toStrictEqual(Option.none())
      }),
    { arbitrary: { runs: 200 } }
  )

  describe("verifyLockfileVersion", () => {
    it.effect("pass when the installed Adamantite wrote the lockfile", () =>
      Effect.gen(function* () {
        expect(yield* verify(makeLockfile("0.47.0"), { installed: "0.47.0" })).toStrictEqual(
          Result.succeed(undefined)
        )
      })
    )

    it.effect("pass without a lockfile", () =>
      Effect.gen(function* () {
        expect(yield* verify(Option.none(), { installed: "0.47.0" })).toStrictEqual(
          Result.succeed(undefined)
        )
      })
    )

    // Before an install, Oxlint cannot load the presets either, and reports that itself.
    it.effect("pass when the project installs no Adamantite", () =>
      Effect.gen(function* () {
        expect(yield* verify(makeLockfile("0.46.0"))).toStrictEqual(Result.succeed(undefined))
      })
    )

    it.effect("fail with SetupOutdated when an older Adamantite wrote the lockfile", () =>
      Effect.gen(function* () {
        expect(yield* verify(makeLockfile("0.46.0"), { installed: "0.47.0" })).toStrictEqual(
          Result.fail(
            new SetupOutdated({ installed: "0.47.0", path: LOCKFILE_PATH, recorded: "0.46.0" })
          )
        )
      })
    )

    it.effect.each([
      { installed: "0.47.0", recorded: "0.48.0" },
      { installed: "0.47.0", recorded: "1.0.0" },
      { installed: "0.9.0", recorded: "0.10.0" },
      // A release comes after its prereleases.
      { installed: "0.48.0-next.1", recorded: "0.48.0" },
    ])(
      "fail with SetupAhead when Adamantite $recorded wrote the lockfile and $installed is installed",
      ({ installed, recorded }) =>
        Effect.gen(function* () {
          expect(yield* verify(makeLockfile(recorded), { installed })).toStrictEqual(
            Result.fail(new SetupAhead({ installed, path: LOCKFILE_PATH, recorded }))
          )
        })
    )

    it.effect.each([
      { installed: "0.48.0", recorded: "0.48.0-next.1" },
      { installed: "0.48.0-next.2", recorded: "0.48.0-next.1" },
      { installed: "0.47.0", recorded: "github:adelrodriguez/adamantite" },
    ])(
      "fail with SetupOutdated when Adamantite $recorded wrote the lockfile and $installed is installed",
      ({ installed, recorded }) =>
        Effect.gen(function* () {
          expect(yield* verify(makeLockfile(recorded), { installed })).toStrictEqual(
            Result.fail(new SetupOutdated({ installed, path: LOCKFILE_PATH, recorded }))
          )
        })
    )

    it.effect("compare with an Adamantite that a parent folder installs", () =>
      Effect.gen(function* () {
        expect(
          yield* verify(makeLockfile("0.46.0"), {
            installed: "0.47.0",
            installedAt: "/workspace",
            root: "/workspace/project",
          })
        ).toStrictEqual(
          Result.fail(
            new SetupOutdated({ installed: "0.47.0", path: LOCKFILE_PATH, recorded: "0.46.0" })
          )
        )
      })
    )
  })
})
