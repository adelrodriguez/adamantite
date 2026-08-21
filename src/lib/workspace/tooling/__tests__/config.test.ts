import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { FastCheck } from "effect/testing"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  detectToolingConfig,
  getConfigFindings,
  getPackageActions,
  type ToolingConfigState,
} from "#lib/workspace/tooling/config.ts"

const ROOT = "/project"
const FILES = { config: "tool.config.ts", legacyConfigs: ["tool.json", "tool.jsonc"] }
const SINGLE_LEGACY_FILES = { config: "tool.config.ts", legacyConfigs: [".toolrc.json"] }

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function detect(
  files: FileSystemTestContext,
  configFiles: typeof FILES | typeof SINGLE_LEGACY_FILES = FILES
) {
  return detectToolingConfig(ROOT, "tool", configFiles).pipe(
    Effect.provide(Layer.mergeAll(files.layer, Path.layer))
  )
}

describe("detectToolingConfig", () => {
  it.effect("return an empty state when no config exists", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      expect(yield* detect(files)).toEqual({
        active: null,
        legacy: [],
        warnings: [],
      })
    })
  )

  it.effect("activate a lone legacy JSON config without warnings", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "tool.json": "{}\n" })

      expect(yield* detect(files)).toEqual({
        active: { file: "tool.json", format: "json", path: `${ROOT}/tool.json` },
        legacy: [],
        warnings: [],
      })
    })
  )

  it.effect("prefer the TS config over every legacy config", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "tool.config.ts": "export default {}\n",
        "tool.json": "{}\n",
        "tool.jsonc": "{}\n",
      })

      const state = yield* detect(files)

      expect(state.active).toEqual({
        file: "tool.config.ts",
        format: "ts",
        path: `${ROOT}/tool.config.ts`,
      })
      expect(state.legacy).toEqual([
        { file: "tool.json", format: "json", path: `${ROOT}/tool.json` },
        { file: "tool.jsonc", format: "jsonc", path: `${ROOT}/tool.jsonc` },
      ])
    })
  )

  it.effect("prefer the JSONC config over the JSON config when no TS config exists", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "tool.json": "{}\n",
        "tool.jsonc": "{}\n",
      })

      const state = yield* detect(files)

      expect(state.active).toEqual({
        file: "tool.jsonc",
        format: "jsonc",
        path: `${ROOT}/tool.jsonc`,
      })
      expect(state.legacy).toEqual([
        { file: "tool.json", format: "json", path: `${ROOT}/tool.json` },
      ])
    })
  )

  it.effect("warn with the json(c) display name when the TS config shadows legacy configs", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "tool.config.ts": "export default {}\n",
        "tool.json": "{}\n",
      })

      const state = yield* detect(files)

      expect(state.warnings).toEqual([
        "Found both `tool.config.ts` and `tool.json(c)`. Adamantite will use `tool.config.ts`.",
      ])
    })
  )

  it.effect("warn with the plain legacy name when the tool has a single legacy config", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        ".toolrc.json": "{}\n",
        "tool.config.ts": "export default {}\n",
      })

      const state = yield* detect(files, SINGLE_LEGACY_FILES)

      expect(state.warnings).toEqual([
        "Found both `tool.config.ts` and `.toolrc.json`. Adamantite will use `tool.config.ts`.",
      ])
    })
  )

  it.effect("warn when multiple legacy configs exist without a TS config", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "tool.json": "{}\n",
        "tool.jsonc": "{}\n",
      })

      const state = yield* detect(files)

      expect(state.warnings).toEqual([
        "Found both `tool.json` and `tool.jsonc`. Multiple legacy tool configs exist; Adamantite will treat `tool.jsonc` as the source of truth in its findings.",
      ])
    })
  )

  it.effect.prop(
    "follow ts > jsonc > json precedence for every combination of present files",
    {
      hasJson: FastCheck.boolean(),
      hasJsonc: FastCheck.boolean(),
      hasTs: FastCheck.boolean(),
      legacyOrder: FastCheck.constantFrom<string[]>(
        ["tool.json", "tool.jsonc"],
        ["tool.jsonc", "tool.json"]
      ),
    },
    ({ hasJson, hasJsonc, hasTs, legacyOrder }) =>
      Effect.gen(function* () {
        const fixtures: Record<string, string> = {}
        if (hasTs) {
          fixtures["tool.config.ts"] = "export default {}\n"
        }
        if (hasJsonc) {
          fixtures["tool.jsonc"] = "{}\n"
        }
        if (hasJson) {
          fixtures["tool.json"] = "{}\n"
        }
        const files = makeFiles(fixtures)

        const state = yield* detect(files, { config: "tool.config.ts", legacyConfigs: legacyOrder })

        const expectedActive = hasTs
          ? "tool.config.ts"
          : hasJsonc
            ? "tool.jsonc"
            : hasJson
              ? "tool.json"
              : null
        expect(state.active?.file ?? null).toBe(expectedActive)

        const expectedLegacy = [hasJson ? "tool.json" : null, hasJsonc ? "tool.jsonc" : null]
          .filter((file) => file !== null)
          .filter((file) => file !== expectedActive)
        expect(
          EffectArray.sort(
            state.legacy.map((entry) => entry.file),
            Order.String
          )
        ).toEqual(EffectArray.sort(expectedLegacy, Order.String))

        const hasWarnings = expectedActive !== null && expectedLegacy.length > 0
        expect(state.warnings.length > 0).toBe(hasWarnings)
      }),
    { fastCheck: { numRuns: 100 } }
  )
})

describe("getPackageActions", () => {
  const pkg = { name: "tool", version: "1.2.3" }

  it("request an install when the package is missing", () => {
    expect(getPackageActions({ name: "test-project" }, pkg, "the managed `test` script")).toEqual([
      {
        description: "Install `tool@1.2.3` for the managed `test` script.",
        package: "tool",
        targetVersion: "1.2.3",
        type: "install_package",
      },
    ])
  })

  it("request an update when the installed version drifts", () => {
    expect(getPackageActions({ devDependencies: { tool: "1.0.0" } }, pkg, "purpose")).toEqual([
      {
        currentVersion: "1.0.0",
        description: "Update `tool` from `1.0.0` to `1.2.3`.",
        package: "tool",
        targetVersion: "1.2.3",
        type: "update_package",
      },
    ])
  })

  it("report nothing when the normalized version matches", () => {
    expect(getPackageActions({ devDependencies: { tool: "^1.2.3" } }, pkg, "purpose")).toEqual([])
    expect(
      getPackageActions({ dependencies: { tool: "workspace:~1.2.3" } }, pkg, "purpose")
    ).toEqual([])
  })

  const specifier = FastCheck.tuple(
    FastCheck.constantFrom("", "workspace:"),
    FastCheck.constantFrom("", "^", "~"),
    FastCheck.constantFrom("1.2.3", "1.0.0", "2.4.6-beta.1")
  ).map(([workspacePrefix, rangePrefix, version]) => ({
    version,
    written: `${workspacePrefix}${rangePrefix}${version}`,
  }))

  it.prop(
    "classify any manifest into exactly one of match, install, or update",
    {
      field: FastCheck.constantFrom("dependencies", "devDependencies"),
      installed: FastCheck.option(specifier),
    },
    ({ field, installed }) => {
      const manifest = installed === null ? {} : { [field]: { tool: installed.written } }
      const actions = getPackageActions(manifest, pkg, "purpose")

      if (installed === null) {
        expect(actions).toEqual([
          expect.objectContaining({ targetVersion: pkg.version, type: "install_package" }),
        ])
      } else if (installed.version === pkg.version) {
        expect(actions).toEqual([])
      } else {
        expect(actions).toEqual([
          expect.objectContaining({
            currentVersion: installed.written,
            targetVersion: pkg.version,
            type: "update_package",
          }),
        ])
      }
    },
    { fastCheck: { numRuns: 200 } }
  )
})

function state(active: ToolingConfigState["active"]): ToolingConfigState {
  return { active, legacy: [], warnings: [] }
}

describe("getConfigFindings", () => {
  const options = {
    configContent: "export default preset\n",
    configFile: "tool.config.ts",
    toolName: "tool",
  }

  it("report a missing config with canonical content", () => {
    expect(getConfigFindings(state(null), options)).toEqual([
      expect.objectContaining({
        id: "missing-tool-config",
        reference: options.configContent,
      }),
    ])
  })

  it("report the ideal state when a legacy config is active", () => {
    expect(
      getConfigFindings(
        state({ file: "tool.jsonc", format: "jsonc", path: "/tmp/tool.jsonc" }),
        options
      )
    ).toEqual([expect.objectContaining({ id: "legacy-tool-config" })])
  })

  it("report nothing when the TS config is active and configured", () => {
    expect(
      getConfigFindings(
        state({ file: "tool.config.ts", format: "ts", path: "/tmp/tool.config.ts" }),
        { ...options, inspection: { kind: "configured" } }
      )
    ).toEqual([])
  })

  it("report invalid content and shadowed legacy files independently", () => {
    expect(
      getConfigFindings(
        {
          active: { file: "tool.config.ts", format: "ts", path: "/tmp/tool.config.ts" },
          legacy: [{ file: "tool.json", format: "json", path: "/tmp/tool.json" }],
          warnings: [],
        },
        { ...options, inspection: { kind: "invalid", reason: "Preset missing." } }
      ).map(({ id }) => id)
    ).toEqual(["shadowed-legacy-tool-config", "invalid-tool-config"])
  })
})
