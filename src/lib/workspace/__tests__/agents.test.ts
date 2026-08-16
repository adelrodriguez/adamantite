import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  ADAMANTITE_AGENTS_END_MARKER,
  ADAMANTITE_AGENTS_START_MARKER,
  writeAgentsGuidance,
} from "#lib/workspace/agents.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

function countOccurrences(content: string, search: string) {
  return content.split(search).length - 1
}

function runWriteAgentsGuidance(
  files: FileSystemTestContext,
  options: Parameters<typeof writeAgentsGuidance>[1]
) {
  return writeAgentsGuidance(ROOT, options).pipe(provideFiles(files))
}

describe("writeAgentsGuidance", () => {
  it.effect("create AGENTS.md when it does not exist", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      const result = yield* runWriteAgentsGuidance(files, {
        packageManager: "bun",
        scripts: ["format", "check"],
      })

      expect(result).toBe("updated")

      const agents = files.read("AGENTS.md")
      expect(agents).toContain(ADAMANTITE_AGENTS_START_MARKER)
      expect(agents).toContain("## Adamantite")
      expect(agents).toContain("Run `bun run format` after editing files")
      expect(agents).toContain("Run `bun run check` to catch lint and type issues")
      expect(agents).not.toContain("adamantite analyze")
      expect(agents).toContain("safe local fixes.\n\n<!-- ADAMANTITE:END -->")
      expect(agents).toContain(ADAMANTITE_AGENTS_END_MARKER)
      expect(agents.endsWith("\n")).toBe(true)
    })
  )

  it.effect("return FailedToReadFile when reading AGENTS.md fails", () =>
    Effect.gen(function* () {
      const agentsPath = `${ROOT}/AGENTS.md`
      const cause = PlatformError.systemError({
        _tag: "PermissionDenied",
        method: "readFileString",
        module: "FileSystem",
        pathOrDescriptor: agentsPath,
      })
      const fileSystemLayer = FileSystem.layerNoop({
        readFileString: () => Effect.fail(cause),
      })

      const result = yield* writeAgentsGuidance(ROOT, {
        packageManager: "bun",
        scripts: ["format"],
      }).pipe(Effect.provide(Layer.mergeAll(fileSystemLayer, Path.layer)), Effect.result)

      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure).toMatchObject({
          _tag: "FailedToReadFile",
          cause,
          path: agentsPath,
        })
      }
    })
  )

  it.effect("append guidance to an existing AGENTS.md without markers", () =>
    Effect.gen(function* () {
      const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n"
      const files = makeFiles({ "AGENTS.md": existingAgents })

      const result = yield* runWriteAgentsGuidance(files, {
        packageManager: "bun",
        scripts: ["format"],
      })

      expect(result).toBe("updated")

      const agents = files.read("AGENTS.md")
      expect(agents.startsWith(`${existingAgents}\n${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(true)
      expect(agents).toContain("Run `bun run format` after editing files")
    })
  )

  it.effect("preserve an existing blank line when appending guidance", () =>
    Effect.gen(function* () {
      const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n\n"
      const files = makeFiles({ "AGENTS.md": existingAgents })

      const result = yield* runWriteAgentsGuidance(files, {
        packageManager: "bun",
        scripts: ["format"],
      })

      expect(result).toBe("updated")

      const agents = files.read("AGENTS.md")
      expect(agents.startsWith(`${existingAgents}${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(true)
    })
  )

  it.effect("replace only the existing Adamantite marker block", () =>
    Effect.gen(function* () {
      const files = makeFiles({
        "AGENTS.md": [
          "# Existing Instructions",
          "",
          "Keep this before.",
          ADAMANTITE_AGENTS_START_MARKER,
          "old content",
          ADAMANTITE_AGENTS_END_MARKER,
          "Keep this after.",
          "",
        ].join("\n"),
      })

      const result = yield* runWriteAgentsGuidance(files, {
        packageManager: "bun",
        scripts: ["analyze"],
      })

      expect(result).toBe("updated")

      const agents = files.read("AGENTS.md")
      expect(agents).toContain("Keep this before.")
      expect(agents).toContain("Keep this after.")
      expect(agents).toContain("Run `bun run analyze` after changing dependencies")
      expect(agents).not.toContain("old content")
      expect(countOccurrences(agents, ADAMANTITE_AGENTS_START_MARKER)).toBe(1)
      expect(countOccurrences(agents, ADAMANTITE_AGENTS_END_MARKER)).toBe(1)
    })
  )

  it.effect(
    "return malformed and leave AGENTS.md unchanged when start marker has no end marker",
    () =>
      Effect.gen(function* () {
        const existingAgents = `# Existing Instructions\n\n${ADAMANTITE_AGENTS_START_MARKER}\nmanual content\n`
        const files = makeFiles({ "AGENTS.md": existingAgents })

        const result = yield* runWriteAgentsGuidance(files, {
          packageManager: "bun",
          scripts: ["format"],
        })

        expect(result).toBe("malformed")
        expect(files.read("AGENTS.md")).toBe(existingAgents)
      })
  )

  it.effect(
    "return malformed and leave AGENTS.md unchanged when end marker has no start marker",
    () =>
      Effect.gen(function* () {
        const existingAgents = `# Existing Instructions\n\nmanual content\n${ADAMANTITE_AGENTS_END_MARKER}\n`
        const files = makeFiles({ "AGENTS.md": existingAgents })

        const result = yield* runWriteAgentsGuidance(files, {
          packageManager: "bun",
          scripts: ["format"],
        })

        expect(result).toBe("malformed")
        expect(files.read("AGENTS.md")).toBe(existingAgents)
      })
  )

  it.effect("generate guidance only for selected scripts", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      yield* runWriteAgentsGuidance(files, {
        packageManager: "bun",
        scripts: ["fix", "check:monorepo", "fix:monorepo"],
      })

      const agents = files.read("AGENTS.md")
      expect(agents).toContain("Direct command: `adamantite fix`")
      expect(agents).toContain("Direct command: `adamantite monorepo`")
      expect(agents).toContain("Direct command: `adamantite monorepo --fix`")
      expect(agents).not.toContain("adamantite format")
      expect(agents).not.toContain("adamantite check`")
      expect(agents).not.toContain("adamantite analyze")
    })
  )

  it.effect("generate package-manager-specific script commands", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      yield* runWriteAgentsGuidance(files, {
        packageManager: "npm",
        scripts: ["format"],
      })

      const agents = files.read("AGENTS.md")
      expect(agents).toContain("Run `npm run format` after editing files")
    })
  )
})
