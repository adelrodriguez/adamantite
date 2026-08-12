import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import {
  detectToolingConfig,
  getConfigActions,
  getPackageActions,
  type ToolingConfigState,
} from "#lib/workspace/tooling/config.ts"

const FILES = { config: "tool.config.ts", legacyConfigs: ["tool.json", "tool.jsonc"] }
const SINGLE_LEGACY_FILES = { config: "tool.config.ts", legacyConfigs: [".toolrc.json"] }

describe("detectToolingConfig", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-tooling-config-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  function detect(files: typeof FILES | typeof SINGLE_LEGACY_FILES = FILES) {
    return detectToolingConfig(tempDir, "tool", files).pipe(
      Effect.provide(NodeServices.layer),
      Effect.runPromise
    )
  }

  test("return an empty state when no config exists", async () => {
    expect(await detect()).toEqual({
      active: null,
      legacy: [],
      warnings: [],
    })
  })

  test("activate a lone legacy JSON config without warnings", async () => {
    await Bun.write("tool.json", "{}\n")

    expect(await detect()).toEqual({
      active: { file: "tool.json", format: "json", path: join(tempDir, "tool.json") },
      legacy: [],
      warnings: [],
    })
  })

  test("prefer the TS config over every legacy config", async () => {
    await Bun.write("tool.config.ts", "export default {}\n")
    await Bun.write("tool.json", "{}\n")
    await Bun.write("tool.jsonc", "{}\n")

    const state = await detect()

    expect(state.active).toEqual({
      file: "tool.config.ts",
      format: "ts",
      path: join(tempDir, "tool.config.ts"),
    })
    expect(state.legacy).toEqual([
      { file: "tool.json", format: "json", path: join(tempDir, "tool.json") },
      { file: "tool.jsonc", format: "jsonc", path: join(tempDir, "tool.jsonc") },
    ])
  })

  test("prefer the JSONC config over the JSON config when no TS config exists", async () => {
    await Bun.write("tool.json", "{}\n")
    await Bun.write("tool.jsonc", "{}\n")

    const state = await detect()

    expect(state.active).toEqual({
      file: "tool.jsonc",
      format: "jsonc",
      path: join(tempDir, "tool.jsonc"),
    })
    expect(state.legacy).toEqual([
      { file: "tool.json", format: "json", path: join(tempDir, "tool.json") },
    ])
  })

  test("warn with the json(c) display name when the TS config shadows legacy configs", async () => {
    await Bun.write("tool.config.ts", "export default {}\n")
    await Bun.write("tool.json", "{}\n")

    const state = await detect()

    expect(state.warnings).toEqual([
      "Found both `tool.config.ts` and `tool.json(c)`. Adamantite will use `tool.config.ts`.",
    ])
  })

  test("warn with the plain legacy name when the tool has a single legacy config", async () => {
    await Bun.write("tool.config.ts", "export default {}\n")
    await Bun.write(".toolrc.json", "{}\n")

    const state = await detect(SINGLE_LEGACY_FILES)

    expect(state.warnings).toEqual([
      "Found both `tool.config.ts` and `.toolrc.json`. Adamantite will use `tool.config.ts`.",
    ])
  })

  test("warn when multiple legacy configs exist without a TS config", async () => {
    await Bun.write("tool.json", "{}\n")
    await Bun.write("tool.jsonc", "{}\n")

    const state = await detect()

    expect(state.warnings).toEqual([
      "Found both `tool.json` and `tool.jsonc`. Multiple legacy tool configs exist; Adamantite will treat `tool.jsonc` as the source of truth when migration is needed.",
    ])
  })
})

describe("getPackageActions", () => {
  const pkg = { name: "tool", version: "1.2.3" }

  test("request an install when the package is missing", () => {
    expect(getPackageActions({ name: "test-project" }, pkg, "the managed `test` script")).toEqual([
      {
        description: "Install `tool@1.2.3` for the managed `test` script.",
        package: "tool",
        targetVersion: "1.2.3",
        type: "install_package",
      },
    ])
  })

  test("request an update when the installed version drifts", () => {
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

  test("report nothing when the normalized version matches", () => {
    expect(getPackageActions({ devDependencies: { tool: "^1.2.3" } }, pkg, "purpose")).toEqual([])
    expect(
      getPackageActions({ dependencies: { tool: "workspace:~1.2.3" } }, pkg, "purpose")
    ).toEqual([])
  })
})

function state(active: ToolingConfigState["active"]): ToolingConfigState {
  return { active, legacy: [], warnings: [] }
}

describe("getConfigActions", () => {
  const options = {
    configFile: "tool.config.ts",
    migrationId: "legacy-tool-json",
    toolName: "tool",
  }

  test("request a config creation when no config exists", () => {
    expect(getConfigActions(state(null), options)).toEqual([
      {
        description: "Create `tool.config.ts` for `tool`.",
        path: "tool.config.ts",
        type: "create_config",
      },
    ])
  })

  test("request a migration when a legacy config is active", () => {
    expect(
      getConfigActions(
        state({ file: "tool.jsonc", format: "jsonc", path: "/tmp/tool.jsonc" }),
        options
      )
    ).toEqual([
      {
        description: "Migrate legacy `tool.jsonc` to `tool.config.ts`.",
        migrationId: "legacy-tool-json",
        type: "run_migration",
      },
    ])
  })

  test("report nothing when the TS config is active", () => {
    expect(
      getConfigActions(
        state({ file: "tool.config.ts", format: "ts", path: "/tmp/tool.config.ts" }),
        options
      )
    ).toEqual([])
  })
})
