import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Arbitrary from "effect/Arbitrary"
import * as Digest from "effect/crypto/Digest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import {
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
} from "#__tests__/command-test-helpers.ts"
import { effectEditorFiles } from "#__tests__/effect-sdk.ts"
import { createFileSystemTestContext, type FileSystemTestContext } from "#__tests__/filesystem.ts"
import { listHashes, makeSelection, runLifecycle } from "#__tests__/lifecycle.ts"
import agents from "#lib/integrations/agents/index.ts"
import { getShippedSkillFiles } from "#lib/integrations/agents/skill.macro.ts" with { type: "macro" }
import { ConfigLoader } from "#lib/project/config-loader.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import * as Project from "#lib/project/index.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { NodeVersionResolver } from "#lib/project/node-version-resolver.ts"
import { addSelection, Selection } from "#lib/project/selection.ts"
import * as Setup from "#lib/setup/index.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../..")

// The test folder does not install `adamantite/format`, so the check loads the preset from the
// repository.
const FORMAT_PRESET = join(REPO_ROOT, "presets/format.ts")

// The files that `Setup.apply` writes: the lockfile, `package.json` with the managed scripts, and
// the managed files of every integration.
const FORMATTED_FILES = [
  LOCKFILE_PATH,
  "package.json",
  "oxlint.config.ts",
  "oxfmt.config.ts",
  "knip.config.ts",
  "tsconfig.json",
  ".vscode/settings.json",
  ".vscode/extensions.json",
  ".zed/settings.json",
  ".github/workflows/adamantite.yml",
  "AGENTS.md",
  ...Object.keys(getShippedSkillFiles()).map((file) => `.agents/skills/adamantite/${file}`),
]

// Every part of the selection that makes Setup write a file, with the longest renders: the VS Code
// settings hide the Effect rules, and every extension is recommended.
const FULL_SELECTION = {
  agents: true,
  ci: "github",
  editors: ["vscode", "zed"],
  presets: [
    "core",
    "react",
    "react-strict",
    "tanstack",
    "nextjs",
    "effect",
    "vitest",
    "architecture",
    "strict",
    "tailwind",
  ],
  scripts: ["check", "fix", "analyze"],
  typescript: "typescript",
} as const satisfies Selection

// The project's Oxfmt, its packages, and the services of Setup on the host filesystem.
const layer = Layer.mergeAll(
  NodeServices.layer,
  NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer)),
  ModuleResolver.layer,
  ConfigLoader.layer.pipe(Layer.provide(NodeServices.layer)),
  Digest.layerWebCrypto,
  // The project has its packages, so the install changes nothing.
  Layer.succeed(DependencyInstaller)({
    addDevDependencies: () => Effect.void,
    detectPackageManager: () => Effect.succeedSome({ name: "bun" }),
  })
)

const apply = (cwd: string) =>
  Project.read().pipe(
    Effect.flatMap((project) => Setup.apply(project, FULL_SELECTION)),
    Effect.provideService(Project.Directory, cwd),
    Effect.provide(layer)
  )

const PACKAGE_JSON = `{
  "name": "test-project",
  "devDependencies": { "adamantite": "1.0.0" },
  "scripts": { "check": "tsc && eslint .", "test": "vitest" }
}
`

const INIT_ARGS = ["--non-interactive", "--script", "check", "--script", "analyze"]

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { "package.json": PACKAGE_JSON, ...files } })
}

const decodeScripts = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }))
)

function readScripts(files: FileSystemTestContext) {
  return decodeScripts(files.read("package.json")).scripts
}

// A managed script is the one exception to whole files: Setup sets the selected key and overwrites
// what it held.
describe("managed scripts", () => {
  it.effect("overwrite a selected script that ran another command, and keep the others", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(readScripts(files)).toStrictEqual({
        analyze: "adamantite analyze",
        check: "adamantite check",
        test: "vitest",
      })
      expect(output).toContain("✔ `check` script replaced: `tsc && eslint .` → `adamantite check`.")
      expect(output).toContain("✔ `analyze` script added: `adamantite analyze`.")
    })
  )

  it.effect("leave package.json byte-identical on a second init", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const before = files.read("package.json")

      const { output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(files.read("package.json")).toBe(before)
      expect(output).toContain("● `check` script is up to date.")
      expect(output).toContain("● `analyze` script is up to date.")
    })
  )

  it.effect("set a selected script again in update after the project changed it", () =>
    Effect.gen(function* () {
      const files = makeProject(makeLockfileFile(makeSelection({ scripts: ["check"] })))

      const { output } = yield* runLifecycle("update", files)

      expect(readScripts(files)).toStrictEqual({ check: "adamantite check", test: "vitest" })
      expect(output).toContain("✔ `check` script replaced: `tsc && eslint .` → `adamantite check`.")
    })
  )

  it.effect("report a selected script that runs another command in doctor, until update", () =>
    Effect.gen(function* () {
      const files = makeProject(makeLockfileFile(makeSelection({ scripts: ["check"] })))
      const finding = "Managed script runs another command"

      const before = yield* runLifecycle("doctor", files)

      expect(getFailure(before.exit)).toStrictEqual(findingsLeft("doctor"))
      expect(before.output).toContain(finding)
      expect(before.output).toContain(
        "the root `package.json` sets it to `tsc && eslint .`, not to `adamantite check`"
      )
      expect(readScripts(files)).toStrictEqual({ check: "tsc && eslint .", test: "vitest" })

      yield* runLifecycle("update", files)
      const after = yield* runLifecycle("doctor", files)

      expect(after.output).not.toContain(finding)
    })
  )
})

// A selection as init records it: each list in the order of its source list, and `core` first
// when the project lints.
const recordedSelection = Arbitrary.schema(Selection).pipe(
  Arbitrary.map((selection) => {
    const recorded = addSelection(makeSelection({}), selection)

    return recorded.presets.length === 0 || recorded.presets[0] === "core"
      ? recorded
      : { ...recorded, presets: ["core" as const, ...recorded.presets] }
  })
)

// The write rule holds for every integration, so these properties run update with any selection
// that init can record. The tests of each integration check what it writes.
describe("the write rule", () => {
  it.effect.prop(
    "record the hash of each file that update writes",
    { selection: recordedSelection },
    ({ selection }) =>
      Effect.gen(function* () {
        const files = makeProject(makeLockfileFile(selection))
        const before = files.list()

        const { exit } = yield* runLifecycle("update", files)

        // Each file that update created in the fresh project is a managed file, so the lockfile
        // records exactly those files, each with the hash of its content.
        const created = files.list().filter((file) => !before.includes(file))

        // The test installer installs nothing, so a selection that sets up a tool leaves findings.
        expect([undefined, findingsLeft("update")]).toContainEqual(getFailure(exit))
        expect(readLockfile(files).written).toStrictEqual(
          Object.fromEntries(created.map((file) => [file, hashContent(files.read(file))]))
        )
      }),
    { arbitrary: { runs: 100 } }
  )

  it.effect.prop(
    "change no file on a second update",
    { selection: recordedSelection },
    ({ selection }) =>
      Effect.gen(function* () {
        const files = makeProject(makeLockfileFile(selection))
        yield* runLifecycle("update", files)
        const before = listHashes(files)

        yield* runLifecycle("update", files)

        expect(listHashes(files)).toStrictEqual(before)
      }),
    { arbitrary: { runs: 100 } }
  )

  it.effect.prop(
    "delete each file that the next selection drops, and keep each file that it still writes",
    { next: recordedSelection, previous: recordedSelection },
    ({ next, previous }) =>
      Effect.gen(function* () {
        const files = makeProject(makeLockfileFile(previous))
        yield* runLifecycle("update", files)
        const { written } = readLockfile(files)
        files.write(LOCKFILE_PATH, makeLockfileFile(next, written)[LOCKFILE_PATH])

        yield* runLifecycle("update", files)

        const kept = readLockfile(files).written

        expect(
          Object.keys(written).filter((file) => files.exists(file) !== file in kept)
        ).toStrictEqual([])
      }),
    { arbitrary: { runs: 100 } }
  )
})

describe("the files that Setup writes", () => {
  let project: string

  beforeEach(() => {
    const folder = mkdtempSync(join(tmpdir(), "adamantite-formatted-"))
    project = join(folder, "project")

    for (const [file, content] of Object.entries({
      ...effectEditorFiles(),
      "package.json": '{ "name": "test-project" }\n',
    })) {
      mkdirSync(dirname(join(project, file)), { recursive: true })
      writeFileSync(join(project, file), content)
    }

    symlinkSync(join(REPO_ROOT, "node_modules/oxfmt"), join(project, "node_modules/oxfmt"))

    // The written `oxfmt.config.ts` imports `adamantite/format`, so a second setup formats with the
    // preset of the repository.
    mkdirSync(join(project, "node_modules/adamantite"))
    writeFileSync(
      join(project, "node_modules/adamantite/package.json"),
      '{ "name": "adamantite", "type": "module", "exports": { "./format": "./format.js" } }\n'
    )
    writeFileSync(
      join(project, "node_modules/adamantite/format.js"),
      `export { default } from ${JSON.stringify(pathToFileURL(FORMAT_PRESET).href)}\n`
    )
  })

  afterEach(() => {
    rmSync(dirname(project), { force: true, recursive: true })
  })

  function readFiles() {
    return Object.fromEntries(
      FORMATTED_FILES.map((file) => [file, readFileSync(join(project, file), "utf8")])
    )
  }

  function runOxfmt(args: readonly string[], files: readonly string[] = FORMATTED_FILES) {
    return spawnSync(join(REPO_ROOT, "node_modules/.bin/oxfmt"), [...args, ...files], {
      cwd: project,
      encoding: "utf8",
    })
  }

  // `adamantite fix` must leave each file as Setup wrote it, so its hash still matches the lockfile.
  it.effect("keep their content when Oxfmt formats them with the format preset", () =>
    Effect.gen(function* () {
      const setup = yield* apply(project)

      expect(setup.files.map(({ _tag }) => _tag)).not.toContain("Kept")
      expect(
        readFileSync(join(project, ".vscode/settings.json"), "utf8")
          + readFileSync(join(project, ".vscode/extensions.json"), "utf8")
      ).toMatch(/"oxc\.lint\.customization"[\s\S]*"TypeScriptTeam\.native-preview"/u)

      const written = readFiles()
      const { status, stderr } = runOxfmt(["--config", FORMAT_PRESET])

      expect({ files: readFiles(), status, stderr }).toStrictEqual({
        files: written,
        status: 0,
        stderr: "",
      })

      const again = yield* apply(project)

      expect({
        files: again.files.map(({ _tag, path }) => [path, _tag]),
        lockfile: again.lockfile,
      }).toStrictEqual({
        files: setup.files.map(({ path }) => [path, "Unchanged"]),
        lockfile: "unchanged",
      })
    })
  )

  it.effect("take the layout that the project's own Oxfmt config gives them", () =>
    Effect.gen(function* () {
      writeFileSync(join(project, ".oxfmtrc.json"), '{ "printWidth": 40 }\n')

      yield* apply(project)

      expect(readFileSync(join(project, ".vscode/extensions.json"), "utf8")).toBe(
        '{\n  "recommendations": [\n    "oxc.oxc-vscode",\n    "webpro.vscode-knip",\n    "TypeScriptTeam.native-preview"\n  ]\n}\n'
      )

      // Oxfmt loads no config beside a conflicting one, so Setup writes no `oxfmt.config.ts`.
      const result = runOxfmt(
        ["--check"],
        FORMATTED_FILES.filter((file) => file !== "oxfmt.config.ts")
      )

      expect(result.stderr).toBe("")
      expect(result.status).toBe(0)
    })
  )

  // Doctor must accept the skill that Setup formatted, and still report a copy that the user changed.
  it.effect("pass the skill assessment with the layout that the project's Oxfmt gives it", () =>
    Effect.gen(function* () {
      writeFileSync(join(project, ".oxfmtrc.json"), '{ "printWidth": 40, "proseWrap": "always" }\n')

      yield* apply(project)

      const skill = join(project, ".agents/skills/adamantite/SKILL.md")

      const assessSkill = Project.read().pipe(
        Effect.flatMap((current) => agents.assess(current, FULL_SELECTION)),
        Effect.map(({ findings }) => findings.map(({ id }) => id)),
        Effect.provideService(Project.Directory, project),
        Effect.provide(layer)
      )

      expect(readFileSync(skill, "utf8")).not.toBe(getShippedSkillFiles()["SKILL.md"])
      expect(yield* assessSkill).toStrictEqual([])

      writeFileSync(skill, `${readFileSync(skill, "utf8")}\nA change of the user.\n`)

      expect(yield* assessSkill).toStrictEqual(["stale-adamantite-skill"])
    })
  )

  it.effect("fail without writing a file when the project's Oxfmt config does not load", () =>
    Effect.gen(function* () {
      writeFileSync(join(project, ".oxfmtrc.json"), '{ "printWidth": "wide" }\n')
      const packageJson = readFileSync(join(project, "package.json"), "utf8")

      const error = yield* Effect.flip(apply(project))

      expect({
        packageJson: readFileSync(join(project, "package.json"), "utf8"),
        tag: error._tag,
        written: FORMATTED_FILES.filter(
          (file) => file !== "package.json" && existsSync(join(project, file))
        ),
      }).toStrictEqual({ packageJson, tag: "FailedToFormatFile", written: [] })
    })
  )
})
