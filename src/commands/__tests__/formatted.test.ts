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
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Digest from "effect/crypto/Digest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { Selection } from "#lib/project/selection.ts"
import { effectEditorFiles } from "#lib/integrations/editors/__tests__/effect-fixture.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { readProject } from "#lib/project/project.ts"
import * as Setup from "#lib/setup/index.ts"
import { createDependencyInstallerTestContext } from "./command-test-helpers.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")

// The test folder does not install `adamantite/format`, so the check loads the preset from the
// repository.
const FORMAT_PRESET = join(REPO_ROOT, "presets/format.ts")

// The files that `Setup.apply` writes. Each integration that moves to `src/lib/integrations/<name>/`
// adds its managed files.
const FORMATTED_FILES = [LOCKFILE_PATH, ".vscode/settings.json", ".vscode/extensions.json"]

// Every part of the selection that makes Setup write a file, with the longest renders: the VS Code
// settings hide the Effect rules, and every extension is recommended.
const FULL_SELECTION = {
  agents: true,
  ci: "github",
  editors: ["vscode", "zed"],
  presets: ["core", "react", "effect"],
  scripts: ["check", "fix", "analyze"],
  typescript: "typescript",
} as const satisfies Selection

// The project's Oxfmt, its packages, and the services of Setup on the host filesystem.
const layer = Layer.mergeAll(
  NodeServices.layer,
  ModuleResolver.layer,
  Digest.layerWebCrypto,
  createDependencyInstallerTestContext().layer
)

const apply = (cwd: string) =>
  readProject(cwd).pipe(
    Effect.flatMap((project) => Setup.apply(project, FULL_SELECTION)),
    Effect.provide(layer)
  )

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
  })

  afterEach(() => {
    rmSync(dirname(project), { force: true, recursive: true })
  })

  function readFiles() {
    return Object.fromEntries(
      FORMATTED_FILES.map((file) => [file, readFileSync(join(project, file), "utf8")])
    )
  }

  function runOxfmt(args: readonly string[]) {
    return spawnSync(join(REPO_ROOT, "node_modules/.bin/oxfmt"), [...args, ...FORMATTED_FILES], {
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

      const result = runOxfmt(["--check"])

      expect(result.stderr).toBe("")
      expect(result.status).toBe(0)
    })
  )

  it.effect("fail without writing a file when the project's Oxfmt config does not load", () =>
    Effect.gen(function* () {
      writeFileSync(join(project, ".oxfmtrc.json"), '{ "printWidth": "wide" }\n')

      const error = yield* Effect.flip(apply(project))

      expect({
        tag: error._tag,
        written: FORMATTED_FILES.filter((file) => existsSync(join(project, file))),
      }).toStrictEqual({ tag: "FailedToFormatFile", written: [] })
    })
  )
})
