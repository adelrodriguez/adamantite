import { mkdtempSync, rmSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, test } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as PlatformError from "effect/PlatformError"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import {
  ADAMANTITE_AGENTS_END_MARKER,
  ADAMANTITE_AGENTS_START_MARKER,
  writeAgentsGuidance,
} from "#lib/workspace/agents.ts"

function countOccurrences(content: string, search: string) {
  return content.split(search).length - 1
}

async function runWriteAgentsGuidance(
  tempDir: string,
  options: Parameters<typeof writeAgentsGuidance>[1]
) {
  return await writeAgentsGuidance(tempDir, options).pipe(
    Effect.provide(NodeServices.layer),
    Effect.runPromise
  )
}

describe("writeAgentsGuidance", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-agents-guidance-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("create AGENTS.md when it does not exist", async () => {
    const result = await runWriteAgentsGuidance(tempDir, {
      packageManager: "bun",
      scripts: ["format", "check"],
    })

    expect(result).toBe("updated")

    const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
    expect(agents).toContain(ADAMANTITE_AGENTS_START_MARKER)
    expect(agents).toContain("## Adamantite")
    expect(agents).toContain("Run `bun run format` after editing files")
    expect(agents).toContain("Run `bun run check` to catch lint and type issues")
    expect(agents).not.toContain("adamantite analyze")
    expect(agents).toContain("safe local fixes.\n\n<!-- ADAMANTITE:END -->")
    expect(agents).toContain(ADAMANTITE_AGENTS_END_MARKER)
    expect(agents.endsWith("\n")).toBe(true)
  })

  test("return FailedToReadFile when checking whether AGENTS.md exists fails", async () => {
    const agentsPath = join(tempDir, "AGENTS.md")
    const cause = PlatformError.systemError({
      _tag: "PermissionDenied",
      method: "access",
      module: "FileSystem",
      pathOrDescriptor: agentsPath,
    })
    const fileSystemLayer = FileSystem.layerNoop({
      exists: () => Effect.fail(cause),
    })

    const result = await writeAgentsGuidance(tempDir, {
      packageManager: "bun",
      scripts: ["format"],
    }).pipe(
      Effect.provide(fileSystemLayer),
      Effect.provide(NodeServices.layer),
      Effect.result,
      Effect.runPromise
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure).toMatchObject({
        _tag: "FailedToReadFile",
        cause,
        path: agentsPath,
      })
    }
  })

  test("append guidance to an existing AGENTS.md without markers", async () => {
    const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n"
    await writeFile(join(tempDir, "AGENTS.md"), existingAgents)

    const result = await runWriteAgentsGuidance(tempDir, {
      packageManager: "bun",
      scripts: ["format"],
    })

    expect(result).toBe("updated")

    const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
    expect(agents.startsWith(`${existingAgents}\n${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(true)
    expect(agents).toContain("Run `bun run format` after editing files")
  })

  test("preserve an existing blank line when appending guidance", async () => {
    const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n\n"
    await writeFile(join(tempDir, "AGENTS.md"), existingAgents)

    const result = await runWriteAgentsGuidance(tempDir, {
      packageManager: "bun",
      scripts: ["format"],
    })

    expect(result).toBe("updated")

    const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
    expect(agents.startsWith(`${existingAgents}${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(true)
  })

  test("replace only the existing Adamantite marker block", async () => {
    await writeFile(
      join(tempDir, "AGENTS.md"),
      [
        "# Existing Instructions",
        "",
        "Keep this before.",
        ADAMANTITE_AGENTS_START_MARKER,
        "old content",
        ADAMANTITE_AGENTS_END_MARKER,
        "Keep this after.",
        "",
      ].join("\n")
    )

    const result = await runWriteAgentsGuidance(tempDir, {
      packageManager: "bun",
      scripts: ["analyze"],
    })

    expect(result).toBe("updated")

    const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
    expect(agents).toContain("Keep this before.")
    expect(agents).toContain("Keep this after.")
    expect(agents).toContain("Run `bun run analyze` after changing dependencies")
    expect(agents).not.toContain("old content")
    expect(countOccurrences(agents, ADAMANTITE_AGENTS_START_MARKER)).toBe(1)
    expect(countOccurrences(agents, ADAMANTITE_AGENTS_END_MARKER)).toBe(1)
  })

  test("return malformed and leave AGENTS.md unchanged when start marker has no end marker", async () => {
    const existingAgents = `# Existing Instructions\n\n${ADAMANTITE_AGENTS_START_MARKER}\nmanual content\n`
    await writeFile(join(tempDir, "AGENTS.md"), existingAgents)

    const result = await runWriteAgentsGuidance(tempDir, {
      packageManager: "bun",
      scripts: ["format"],
    })

    expect(result).toBe("malformed")
    expect(await readFile(join(tempDir, "AGENTS.md"), "utf8")).toBe(existingAgents)
  })

  test("return malformed and leave AGENTS.md unchanged when end marker has no start marker", async () => {
    const existingAgents = `# Existing Instructions\n\nmanual content\n${ADAMANTITE_AGENTS_END_MARKER}\n`
    await writeFile(join(tempDir, "AGENTS.md"), existingAgents)

    const result = await runWriteAgentsGuidance(tempDir, {
      packageManager: "bun",
      scripts: ["format"],
    })

    expect(result).toBe("malformed")
    expect(await readFile(join(tempDir, "AGENTS.md"), "utf8")).toBe(existingAgents)
  })

  test("generate guidance only for selected scripts", async () => {
    await runWriteAgentsGuidance(tempDir, {
      packageManager: "bun",
      scripts: ["fix", "check:monorepo", "fix:monorepo"],
    })

    const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
    expect(agents).toContain("Direct command: `adamantite fix`")
    expect(agents).toContain("Direct command: `adamantite monorepo`")
    expect(agents).toContain("Direct command: `adamantite monorepo --fix`")
    expect(agents).not.toContain("adamantite format")
    expect(agents).not.toContain("adamantite check`")
    expect(agents).not.toContain("adamantite analyze")
  })

  test("generate package-manager-specific script commands", async () => {
    await runWriteAgentsGuidance(tempDir, {
      packageManager: "npm",
      scripts: ["format"],
    })

    const agents = await testFile(join(tempDir, "AGENTS.md")).text()
    expect(agents).toContain("Run `npm run format` after editing files")
  })
})
