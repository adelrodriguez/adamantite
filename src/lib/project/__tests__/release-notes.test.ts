import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { readReleaseNotes } from "#lib/project/release-notes.ts"

// The changelog that Changesets writes: the newest release first.
const CHANGELOG = `# adamantite

## 0.49.0

### Minor Changes

- Rename the shadcn preset to tailwind

  To migrate, replace \`adamantite/lint/shadcn\` with \`adamantite/lint/tailwind\`.

## 0.48.1

### Patch Changes

- Fix a report of the layers rule

## 0.48.0

### Minor Changes

- Record the setup in a lockfile
`

// The project at `root` resolves `adamantite/lint` to the package in `installedAt`, which holds the
// manifest of Adamantite `installed` and, unless `changelog` is false, its changelog.
function read(
  from: string,
  options: {
    changelog?: boolean
    installed?: string
    installedAt?: string
    root?: string
  } = {}
) {
  const { changelog = true, installed, installedAt = "/project", root = "/project" } = options
  const directory = `${installedAt.slice(1)}/node_modules/adamantite`

  const files = createFileSystemTestContext({ root: "/" })

  if (installed !== undefined) {
    files.write(
      `${directory}/package.json`,
      JSON.stringify({ name: "adamantite", version: installed })
    )
  }

  if (installed !== undefined && changelog) {
    files.write(`${directory}/CHANGELOG.md`, CHANGELOG)
  }

  const resolver = makeModuleResolverLayer(
    "/",
    installed === undefined ? {} : { "adamantite/lint": `/${directory}/dist/presets/lint.js` }
  )

  return readReleaseNotes(root, from).pipe(Effect.provide([files.layer, Path.layer, resolver]))
}

describe("readReleaseNotes", () => {
  it.effect(
    "take the releases after the recorded version up to the installed one, oldest first",
    () =>
      Effect.gen(function* () {
        expect(yield* read("0.48.0", { installed: "0.49.0" })).toStrictEqual(
          Option.some({
            changelog: "node_modules/adamantite/CHANGELOG.md",
            from: "0.48.0",
            releases: [
              {
                notes: "### Patch Changes\n\n- Fix a report of the layers rule",
                version: "0.48.1",
              },
              {
                notes:
                  "### Minor Changes\n\n- Rename the shadcn preset to tailwind\n\n  To migrate, replace `adamantite/lint/shadcn` with `adamantite/lint/tailwind`.",
                version: "0.49.0",
              },
            ],
          })
        )
      })
  )

  it.effect("take no release when the installed version wrote the lockfile", () =>
    Effect.gen(function* () {
      expect(yield* read("0.49.0", { installed: "0.49.0" })).toStrictEqual(
        Option.some({
          changelog: "node_modules/adamantite/CHANGELOG.md",
          from: "0.49.0",
          releases: [],
        })
      )
    })
  )

  it.effect("take the release of a prerelease that wrote the lockfile", () =>
    Effect.gen(function* () {
      expect(
        Option.map(yield* read("0.49.0-next.0", { installed: "0.49.0" }), ({ releases }) =>
          releases.map(({ version }) => version)
        )
      ).toStrictEqual(Option.some(["0.49.0"]))
    })
  )

  it.effect("name the changelog of an Adamantite that a parent folder installs", () =>
    Effect.gen(function* () {
      expect(
        Option.map(
          yield* read("0.48.0", { installed: "0.49.0", root: "/project/packages/app" }),
          ({ changelog }) => changelog
        )
      ).toStrictEqual(Option.some("../../node_modules/adamantite/CHANGELOG.md"))
    })
  )

  it.effect.each([
    { name: "the project installs no Adamantite", options: {} },
    {
      name: "the installed package has no changelog",
      options: { changelog: false, installed: "0.49.0" },
    },
  ])("read nothing when $name", ({ options }) =>
    Effect.gen(function* () {
      expect(yield* read("0.48.0", options)).toStrictEqual(Option.none())
    })
  )

  // A Git or file source records a version that is no release, so no range starts at it.
  it.effect("read the changelog of a linked package from a project path through a symlink", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        links: {
          "/tmp/link": "/tmp/workspace/app",
          "/tmp/workspace/app/node_modules/adamantite": "/tmp/store",
        },
        root: "/",
      })

      files.write("tmp/workspace/app/package.json", "{}")
      files.write("tmp/store/package.json", `{"name":"adamantite","version":"0.49.0"}`)
      files.write("tmp/store/CHANGELOG.md", CHANGELOG)

      const notes = yield* readReleaseNotes("/tmp/link", "0.49.0-beta.1").pipe(
        Effect.provide([
          files.layer,
          Path.layer,
          makeModuleResolverLayer("/", { "adamantite/lint": "/tmp/store/dist/presets/lint.js" }),
        ])
      )

      expect(
        Option.map(notes, ({ changelog, releases }) => ({ changelog, releases }))
      ).toStrictEqual(
        Option.some({
          changelog: "../../store/CHANGELOG.md",
          releases: [expect.objectContaining({ version: "0.49.0" })],
        })
      )
    })
  )

  it.effect("read nothing when the recorded version is no release", () =>
    Effect.gen(function* () {
      expect(yield* read("github:adelrodriguez/adamantite", { installed: "0.49.0" })).toStrictEqual(
        Option.none()
      )
    })
  )
})
