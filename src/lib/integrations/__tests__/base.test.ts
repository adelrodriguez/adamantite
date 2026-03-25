import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineIntegration } from "#lib/integrations/base.ts"

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

  test("preserve metadata for tooling and workspace integrations", () => {
    const toolingIntegration = defineIntegration({ kind: "tooling", name: "tooling-example" })
    const workspaceIntegration = defineIntegration({ kind: "workspace", name: "workspace-example" })

    expect(toolingIntegration.kind).toBe("tooling")
    expect(workspaceIntegration.kind).toBe("workspace")
  })
})
