import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import migrationRemovedReactCompilerRule from "#lib/migrations/removed-react-compiler-rule.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("removedReactCompilerRule", () => {
  it.effect("check is not applicable without an oxlint config", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      const result = yield* migrationRemovedReactCompilerRule
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result).toEqual({ status: "not-applicable", warnings: [] })
    })
  )

  it.effect("check is not applicable when the config never sets the removed rule", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          '  rules: { "react/jsx-key": "error" },',
          "})",
          "",
        ].join("\n"),
      })

      const result = yield* migrationRemovedReactCompilerRule
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result).toEqual({ status: "not-applicable", warnings: [] })
    })
  )

  it.effect("check is not applicable when the rule name only appears in a comment", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          "  // The react preset used to enable react/react-compiler.",
          '  rules: { "react/jsx-key": "error" },',
          "})",
          "",
        ].join("\n"),
      })

      const result = yield* migrationRemovedReactCompilerRule
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result).toEqual({ status: "not-applicable", warnings: [] })
    })
  )

  it.effect("check warns without applying when the config shape cannot be patched safely", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'const config = { rules: { "react/react-compiler": "off" } }',
          "",
          "export default config",
          "",
        ].join("\n"),
      })

      const result = yield* migrationRemovedReactCompilerRule
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result.status).toBe("not-applicable")
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain("react/react-compiler")
    })
  )

  it.effect("check warns when the rule hides behind a computed key", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'import { defineConfig } from "oxlint"',
          "",
          'const name = "react/react-compiler"',
          "",
          "export default defineConfig({",
          '  rules: { [name]: "off" },',
          "})",
          "",
        ].join("\n"),
      })

      const result = yield* migrationRemovedReactCompilerRule
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result.status).toBe("not-applicable")
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain("react/react-compiler")
    })
  )

  it.effect("check warns when the rule could hide behind a spread", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'import { defineConfig } from "oxlint"',
          "",
          'const shared = { "react/react-compiler": "off" }',
          "",
          "export default defineConfig({",
          "  rules: { ...shared },",
          "})",
          "",
        ].join("\n"),
      })

      const result = yield* migrationRemovedReactCompilerRule
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))

      expect(result.status).toBe("not-applicable")
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain("react/react-compiler")
    })
  )

  it.effect(
    "check warns instead of partially patching when an array spread could hide the rule",
    () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "oxlint.config.ts": [
            'import { defineConfig } from "oxlint"',
            "",
            'const shared = [{ rules: { "react/react-compiler": "off" } }]',
            "",
            "export default defineConfig({",
            '  rules: { "react/react-compiler": "off" },',
            "  overrides: [...shared],",
            "})",
            "",
          ].join("\n"),
        })

        const result = yield* migrationRemovedReactCompilerRule
          .check({ cwd: ROOT })
          .pipe(provideFiles(files))

        expect(result.status).toBe("not-applicable")
        expect(result.warnings).toHaveLength(1)
        expect(result.warnings[0]).toContain("react/react-compiler")
      })
  )

  it.effect("migrate removes a trailing line comment that annotated the removed entry", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          "  rules: {",
          '    "react/jsx-key": "error",',
          '    "react/react-compiler": "off", // legacy nursery rule',
          "  },",
          "})",
          "",
        ].join("\n"),
      })

      yield* migrationRemovedReactCompilerRule.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      expect(files.read("oxlint.config.ts")).toBe(
        [
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          "  rules: {",
          '    "react/jsx-key": "error",',
          "  },",
          "})",
          "",
        ].join("\n")
      )

      yield* migrationRemovedReactCompilerRule.validate({ cwd: ROOT }).pipe(provideFiles(files))
    })
  )

  it.effect("migrate preserves the user's comments and formatting", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'import { defineConfig } from "oxlint"',
          "",
          "// keep this comment",
          "export default defineConfig({",
          "  rules: {",
          "    // team decision, do not remove",
          '    "react/jsx-key": "error",',
          '    "react/react-compiler": "off",',
          "  },",
          "})",
          "",
        ].join("\n"),
      })

      yield* migrationRemovedReactCompilerRule.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      expect(files.read("oxlint.config.ts")).toBe(
        [
          'import { defineConfig } from "oxlint"',
          "",
          "// keep this comment",
          "export default defineConfig({",
          "  rules: {",
          "    // team decision, do not remove",
          '    "react/jsx-key": "error",',
          "  },",
          "})",
          "",
        ].join("\n")
      )

      yield* migrationRemovedReactCompilerRule.validate({ cwd: ROOT }).pipe(provideFiles(files))
    })
  )

  it.effect("migrate removes the rule from the root rules object", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          "  rules: {",
          '    "react/jsx-key": "error",',
          '    "react/react-compiler": "off",',
          "  },",
          "})",
          "",
        ].join("\n"),
      })

      const checkResult = yield* migrationRemovedReactCompilerRule
        .check({ cwd: ROOT })
        .pipe(provideFiles(files))
      expect(checkResult.status).toBe("needed")

      yield* migrationRemovedReactCompilerRule.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      const content = files.read("oxlint.config.ts")
      expect(content).not.toContain("react/react-compiler")
      expect(content).toContain('"react/jsx-key": "error"')

      yield* migrationRemovedReactCompilerRule.validate({ cwd: ROOT }).pipe(provideFiles(files))
    })
  )

  it.effect("migrate removes the rule from overrides entries", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "oxlint.config.ts": [
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          "  overrides: [",
          "    {",
          '      files: ["src/**/*.tsx"],',
          '      rules: { "react/react-compiler": "off", "react/jsx-key": "error" },',
          "    },",
          "  ],",
          "})",
          "",
        ].join("\n"),
      })

      yield* migrationRemovedReactCompilerRule.migrate({ cwd: ROOT }).pipe(provideFiles(files))

      const content = files.read("oxlint.config.ts")
      expect(content).not.toContain("react/react-compiler")
      expect(content).toContain('"react/jsx-key": "error"')

      yield* migrationRemovedReactCompilerRule.validate({ cwd: ROOT }).pipe(provideFiles(files))
    })
  )
})
