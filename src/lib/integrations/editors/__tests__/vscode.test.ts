import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import type { Script } from "#lib/workspace/package-json.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { createRunnerTestContext } from "#commands/__tests__/command-test-helpers.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import {
  CliNotFound,
  EffectEditorUnavailable,
  InvalidConfigFormat,
  VscodeCliNotFound,
} from "#lib/shared/errors.ts"
import { formatJson, parseJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"
import {
  EFFECT_COMPILER,
  EFFECT_EDITOR_PACKAGES,
  EFFECT_SDK,
  effectEditorFiles,
  effectEditorResolver,
} from "./effect-fixture.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([
    files.layer,
    Path.layer,
    effectEditorResolver(ROOT, files.exists("node_modules/@effect/tsgo/package.json")),
  ])
}

describe("vscode", () => {
  describe("extension", () => {
    it.effect("install native TypeScript support with the Effect preset", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()
        yield* vscode.extension(["check"], ["effect"]).pipe(Effect.provide(runner.layer))
        expect(runner.invocations.map(({ args }) => args)).toStrictEqual([
          ["--install-extension", "oxc.oxc-vscode"],
          ["--install-extension", "TypeScriptTeam.native-preview"],
        ])
      })
    )

    it.effect.each<{ expected: string[]; name: string; scripts: Script[] }>([
      { expected: ["oxc.oxc-vscode"], name: "install Oxc for check", scripts: ["check"] },
      { expected: ["oxc.oxc-vscode"], name: "install Oxc for fix", scripts: ["fix"] },
      { expected: ["webpro.vscode-knip"], name: "install Knip for analyze", scripts: ["analyze"] },
      {
        expected: ["oxc.oxc-vscode", "webpro.vscode-knip"],
        name: "install Oxc once and Knip for every script",
        scripts: ["analyze", "check", "fix"],
      },
      { expected: [], name: "install nothing without scripts", scripts: [] },
    ])("$name", ({ expected, scripts }) =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* vscode.extension(scripts).pipe(Effect.provide(runner.layer))

        expect(runner.invocations.map(({ args, command }) => ({ args, command }))).toStrictEqual(
          expected.map((extension) => ({
            args: ["--install-extension", extension],
            command: "code",
          }))
        )
      })
    )

    it.effect("return VscodeCliNotFound when the code command is not found", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext({
          implementation: (options) => Effect.fail(new CliNotFound({ command: options.command })),
        })

        const error = yield* vscode
          .extension(["check"])
          .pipe(Effect.provide(runner.layer), Effect.flip)

        expect(error).toBeInstanceOf(VscodeCliNotFound)
        expect(error).toMatchObject({ cause: new CliNotFound({ command: "code" }) })
      })
    )
  })

  describe("create", () => {
    it.effect(
      "prepare the Effect SDK in node_modules and select it without changing packages",
      () =>
        Effect.gen(function* () {
          const installed = effectEditorFiles()
          const files = makeFiles(installed)
          files.makeReadOnly("node_modules/@effect")
          files.makeReadOnly("node_modules/typescript")

          yield* vscode.create(ROOT).pipe(provideFiles(files))

          const config = yield* parseJson(files.read(".vscode/settings.json"))
          expect(config).toMatchObject({
            "js/ts.tsdk.path": EFFECT_SDK,
            "oxc.lint.customization": {
              "effecttsgo/global-json-in-effect": { severity: "off" },
              "effecttsgo/missing-star-in-yield-effect-gen": { severity: "off" },
            },
          })
          const binary = EFFECT_COMPILER.split("/").at(-1)
          expect(files.read(`${EFFECT_SDK}/${binary}`)).toBe("native compiler")
          expect(files.read(`${EFFECT_SDK}/lib.es5.d.ts`)).toBe("interface String {}")

          for (const [path, content] of Object.entries(installed)) {
            expect(files.read(path)).toBe(content)
          }

          const assessment = yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => vscode.assess(project)),
            provideFiles(files)
          )

          expect(assessment).toMatchObject({ applicable: true, findings: [] })
        })
    )

    it.effect("create .vscode/settings.json", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* vscode.create(ROOT).pipe(provideFiles(files))

        const exists = yield* vscode.detect(ROOT).pipe(provideFiles(files))
        expect(exists).toBe(true)

        const config = yield* parseJson(files.read(".vscode/settings.json"))

        expect(config).toHaveProperty(["editor.formatOnSave"], true)
        // The Astro extension sets its own formatter for Astro, so a global default does not apply.
        expect(config).toHaveProperty(["[astro]", "editor.defaultFormatter"], "oxc.oxc-vscode")
        expect(config).toHaveProperty(["oxc.path.oxlint"], "node_modules/adamantite/dist/oxlint.js")
        expect(config).not.toHaveProperty(["js/ts.tsdk.path"])
      })
    )

    it.effect("copy the versioned compiler that matches the installed TypeScript commit", () =>
      Effect.gen(function* () {
        const files = makeFiles(effectEditorFiles())
        const source = EFFECT_COMPILER.replace("/lib/", "/artifacts/typescript/7.0.2/")
        files.write(
          EFFECT_COMPILER.replace(/tsc(?:\.exe)?$/, "upstream.json"),
          yield* formatJson({
            components: {
              typescript: {
                "7.0.2": { gitHead: "typescript-commit" },
                "7.1.0-beta": { gitHead: "newer-commit" },
              },
            },
            schemaVersion: 5,
            tags: { typescript: { latest: "7.1.0-beta" } },
          })
        )
        files.write(source, "versioned compiler")
        files.write(source.replace(/tsc(?:\.exe)?$/, "lib.d.ts"), "versioned standard library")
        yield* vscode.create(ROOT).pipe(provideFiles(files))
        expect(files.read(`${EFFECT_SDK}/${source.split("/").at(-1)}`)).toBe("versioned compiler")
        expect(files.read(`${EFFECT_SDK}/lib.d.ts`)).toBe("versioned standard library")
      })
    )
  })

  describe("update", () => {
    it.effect("refresh a stale SDK and keep unrelated editor customizations", () =>
      Effect.gen(function* () {
        const files = makeFiles(effectEditorFiles())
        yield* vscode.create(ROOT).pipe(provideFiles(files))
        files.write(
          "node_modules/@effect/tsgo/package.json",
          yield* formatJson({ version: "0.67.4" })
        )
        files.write(EFFECT_COMPILER, "updated compiler")
        files.write(
          ".vscode/settings.json",
          yield* formatJson({
            "editor.tabSize": 4,
            "oxc.lint.customization": {
              "effecttsgo/floating-effect": { autofix: false, severity: "warn" },
              eqeqeq: { severity: "hint" },
            },
          })
        )
        const before = files.list().map((path) => [path, files.read(path)])

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => vscode.assess(project)),
          provideFiles(files)
        )

        expect(result).toMatchObject({
          findings: expect.arrayContaining([
            {
              currentState: expect.stringContaining("does not match"),
              goal: expect.any(Array),
              id: "vscode-effect-sdk",
              integration: "vscode",
              title: expect.any(String),
            },
          ]),
        })
        expect(files.list().map((path) => [path, files.read(path)])).toStrictEqual(before)

        yield* vscode.update(ROOT).pipe(provideFiles(files))
        const config = yield* parseJson(files.read(".vscode/settings.json"))
        expect(config).toMatchObject({
          "editor.tabSize": 4,
          "oxc.lint.customization": {
            "effecttsgo/floating-effect": { autofix: false, severity: "off" },
            eqeqeq: { severity: "hint" },
          },
        })
        expect(files.read(`${EFFECT_SDK}/${EFFECT_COMPILER.split("/").at(-1)}`)).toBe(
          "updated compiler"
        )
        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => vscode.assess(project)),
            provideFiles(files)
          )
        ).toMatchObject({ findings: [] })
      })
    )

    it.effect("report and rebuild a cache with a missing standard library", () =>
      Effect.gen(function* () {
        const files = makeFiles(effectEditorFiles())
        yield* vscode.create(ROOT).pipe(provideFiles(files))
        yield* Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          yield* fs.remove(`${ROOT}/${EFFECT_SDK}/lib.es5.d.ts`)
        }).pipe(provideFiles(files))

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => vscode.assess(project)),
          provideFiles(files)
        )

        expect(result).toMatchObject({
          findings: [expect.objectContaining({ id: "vscode-effect-sdk" })],
        })

        yield* vscode.update(ROOT).pipe(provideFiles(files))
        expect(files.read(`${EFFECT_SDK}/lib.es5.d.ts`)).toBe("interface String {}")
        const first = files.read(".vscode/settings.json")
        yield* vscode.update(ROOT).pipe(provideFiles(files))
        expect(files.read(".vscode/settings.json")).toBe(first)
      })
    )

    it.effect("report an unsupported TypeScript build without changing files", () =>
      Effect.gen(function* () {
        const files = makeFiles({ ...effectEditorFiles(), ".vscode/settings.json": "{}" })
        files.write(
          "node_modules/typescript/package.json",
          yield* formatJson({ gitHead: "unsupported", version: "7.0.2" })
        )
        const before = files.list().map((path) => [path, files.read(path)])

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => vscode.assess(project)),
          provideFiles(files)
        )

        expect(result).toMatchObject({
          findings: expect.arrayContaining([
            expect.objectContaining({
              currentState: expect.stringContaining("no editor compiler matching TypeScript"),
              id: "vscode-effect-sdk",
            }),
          ]),
        })
        const error = yield* vscode.update(ROOT).pipe(provideFiles(files), Effect.flip)
        expect(error).toBeInstanceOf(EffectEditorUnavailable)
        expect(files.list().map((path) => [path, files.read(path)])).toStrictEqual(before)
      })
    )

    it.effect.each([
      { name: "only TypeScript 6 is installed", typescript: { version: "6.0.3" } },
      { name: "TypeScript 7 has no gitHead", typescript: { version: "7.0.2" } },
    ])("refuse the Effect editor SDK when $name", ({ typescript }) =>
      Effect.gen(function* () {
        const files = makeFiles({ ...effectEditorFiles(), ".vscode/settings.json": "{}" })
        files.write("node_modules/typescript/package.json", yield* formatJson(typescript))

        const error = yield* vscode.update(ROOT).pipe(provideFiles(files), Effect.flip)

        expect(error).toBeInstanceOf(EffectEditorUnavailable)
        expect(error).toMatchObject({
          reason: expect.stringContaining(
            "needs an installed native TypeScript package with its gitHead"
          ),
        })
      })
    )

    it.effect("use @typescript/native when the typescript package is older than 7", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...effectEditorFiles(),
          ".vscode/settings.json": "{}",
          "node_modules/@typescript/native/package.json": yield* formatJson({
            gitHead: "typescript-commit",
            version: "7.0.2",
          }),
          "node_modules/typescript/package.json": yield* formatJson({ version: "6.0.3" }),
        })

        yield* vscode.update(ROOT).pipe(
          Effect.provide([
            files.layer,
            Path.layer,
            makeModuleResolverLayer(ROOT, {
              ...EFFECT_EDITOR_PACKAGES,
              "@typescript/native/package.json": "node_modules/@typescript/native/package.json",
            }),
          ])
        )

        expect(files.read(`${EFFECT_SDK}/lib.es5.d.ts`)).toBe("interface String {}")
      })
    )

    it.effect("update an existing .vscode/settings.json config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": yield* formatJson({
            "editor.tabSize": 4,
            "files.autoSave": "afterDelay",
          }),
        })

        const existsBefore = yield* vscode.detect(ROOT).pipe(provideFiles(files))
        expect(existsBefore).toBe(true)
        yield* vscode.update(ROOT).pipe(provideFiles(files))

        const config = yield* parseJson(files.read(".vscode/settings.json"))

        expect(config).toHaveProperty(["editor.tabSize"], 4)
        expect(config).toHaveProperty(["files.autoSave"], "afterDelay")
        expect(config).toHaveProperty(["editor.formatOnSave"], true)
        expect(config).toHaveProperty(["editor.formatOnPaste"], true)
      })
    )

    it.effect("keep the project's values and set the Oxlint entry", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": yield* formatJson({
            "editor.formatOnSave": false,
            "oxc.path.oxlint": "node_modules/.bin/oxlint",
            "oxc.typeAware": false,
            // A null setting is a project choice, such as no default terminal profile.
            "terminal.integrated.defaultProfile.linux": null,
          }),
        })

        yield* vscode.update(ROOT).pipe(provideFiles(files))

        const config = yield* parseJson(files.read(".vscode/settings.json"))

        expect(config).toMatchObject({
          "editor.formatOnSave": false,
          "oxc.path.oxlint": "node_modules/adamantite/dist/oxlint.js",
          "oxc.typeAware": false,
          "terminal.integrated.defaultProfile.linux": null,
        })
      })
    )

    it.effect("remain idempotent across repeated updates", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": yield* formatJson({ "editor.tabSize": 4 }),
        })

        yield* vscode.update(ROOT).pipe(provideFiles(files))
        const firstUpdate = files.read(".vscode/settings.json")
        yield* vscode.update(ROOT).pipe(provideFiles(files))
        const secondUpdate = files.read(".vscode/settings.json")

        expect(secondUpdate).toBe(firstUpdate)
      })
    )

    it.effect("keep the comments and indentation of the existing config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": '{\n\t// Team setting\n\t"editor.tabSize": 4,\n}\n',
        })

        yield* vscode.update(ROOT).pipe(provideFiles(files))

        const content = files.read(".vscode/settings.json")

        expect(content).toMatch(
          /^\{\n\t\/\/ Team setting\n\t"editor\.tabSize": 4,\n\t"\[css\]": \{\n\t\t"/u
        )
        expect(content).toContain('\t"editor.formatOnSave": true')
      })
    )

    it.effect("return InvalidConfigFormat when the config is not a JSON object", () =>
      Effect.gen(function* () {
        const files = makeFiles({ ".vscode/settings.json": "[]" })

        const result = yield* Effect.result(vscode.update(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)

        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(InvalidConfigFormat)
        }
      })
    )
  })
})
