import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"

describe("defineIntegration", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-integrations-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("preserve kind-specific capabilities and metadata", () => {
    const toolingIntegration = defineIntegration({
      assess: (_cwd: string) =>
        Effect.succeed({ applicable: false, warnings: [] } satisfies IntegrationAssessment),
      kind: "tooling",
      name: "tooling-example",
      version: "1.0.0",
    })
    const workspaceIntegration = defineIntegration({
      create: (_cwd: string) => Effect.void,
      detect: (_cwd: string) => Effect.succeed(false),
      kind: "workspace",
      name: "workspace-example",
      update: (_cwd: string) => Effect.void,
    })
    const ciIntegration = defineIntegration({
      create: (_cwd: string, _options: { readonly enabled: boolean }) => Effect.void,
      detect: (_cwd: string) => Effect.succeed(false),
      kind: "ci",
      name: "ci-example",
      update: (_cwd: string, _options: { readonly enabled: boolean }) => Effect.void,
    })

    expect(toolingIntegration.kind).toBe("tooling")
    expect(workspaceIntegration.kind).toBe("workspace")
    expect(ciIntegration.kind).toBe("ci")
  })
})
