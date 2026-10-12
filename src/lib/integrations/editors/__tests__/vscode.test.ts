import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import type { Script } from "#lib/workspace/package-json.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { createRunnerTestContext } from "#commands/__tests__/command-test-helpers.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import { CliNotFound } from "#lib/shared/errors.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("vscode", () => {
  describe("extension", () => {
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

        expect(error).toMatchObject({
          _tag: "VscodeCliNotFound",
          cause: { _tag: "CliNotFound", command: "code" },
        })
      })
    )
  })

  describe("create", () => {
    it.effect("create .vscode/settings.json", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* vscode.create(ROOT).pipe(provideFiles(files))

        const exists = yield* vscode.detect(ROOT).pipe(provideFiles(files))
        expect(exists).toBe(true)

        const config = JSON.parse(files.read(".vscode/settings.json"))

        expect(config).toHaveProperty(["editor.formatOnSave"])
        expect(config["editor.formatOnSave"]).toBe(true)
      })
    )
  })

  describe("update", () => {
    it.effect("update an existing .vscode/settings.json config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": JSON.stringify(
            {
              "editor.tabSize": 4,
              "files.autoSave": "afterDelay",
            },
            null,
            2
          ),
        })

        const existsBefore = yield* vscode.detect(ROOT).pipe(provideFiles(files))
        expect(existsBefore).toBe(true)
        yield* vscode.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(".vscode/settings.json"))

        expect(config["editor.tabSize"]).toBe(4)
        expect(config["files.autoSave"]).toBe("afterDelay")
        expect(config["editor.formatOnSave"]).toBe(true)
        expect(config["editor.formatOnPaste"]).toBe(true)
      })
    )

    it.effect("remain idempotent across repeated updates", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": JSON.stringify({ "editor.tabSize": 4 }, null, 2),
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
          expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
        }
      })
    )
  })
})
