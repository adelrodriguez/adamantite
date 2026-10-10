import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  ADAMANTITE_AGENTS_END_MARKER,
  ADAMANTITE_AGENTS_START_MARKER,
  writeAgentsGuidance,
} from "#lib/workspace/agents.ts"
import { MANAGED_SCRIPT_COMMANDS, type Script } from "#lib/workspace/package-json.ts"

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
  it.effect("create AGENTS.md with the script guidance in check, fix, analyze order", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      const result = yield* runWriteAgentsGuidance(files, {
        isMonorepo: false,
        packageManager: "bun",
        scripts: ["analyze", "fix", "check"],
      })

      const agents = files.read("AGENTS.md")
      expect(result).toBe("updated")
      expect(
        Array.from(agents.matchAll(/^- Run `bun run (\w+)`/gm), ([, script]) => script)
      ).toStrictEqual(["check", "fix", "analyze"])
      expect(agents).toContain(".adamantite/rules")
    })
  )

  it.effect("append guidance to an existing AGENTS.md without markers", () =>
    Effect.gen(function* () {
      const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n"
      const files = makeFiles({ "AGENTS.md": existingAgents })

      const result = yield* runWriteAgentsGuidance(files, {
        isMonorepo: false,
        packageManager: "bun",
        scripts: ["fix"],
      })

      expect(result).toBe("updated")

      const agents = files.read("AGENTS.md")
      expect(agents.startsWith(`${existingAgents}\n${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(true)
      expect(agents).toContain("Run `bun run fix` to apply safe lint fixes and format code")
    })
  )

  it.effect("preserve an existing blank line when appending guidance", () =>
    Effect.gen(function* () {
      const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n\n"
      const files = makeFiles({ "AGENTS.md": existingAgents })

      const result = yield* runWriteAgentsGuidance(files, {
        isMonorepo: false,
        packageManager: "bun",
        scripts: ["fix"],
      })

      expect(result).toBe("updated")

      const agents = files.read("AGENTS.md")
      expect(agents.startsWith(`${existingAgents}${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(true)
    })
  )

  it.effect("mention monorepo checks in the analyze guidance only in a monorepo", () =>
    Effect.gen(function* () {
      const files = makeFiles()

      yield* runWriteAgentsGuidance(files, {
        isMonorepo: false,
        packageManager: "bun",
        scripts: ["analyze"],
      })

      expect(files.read("AGENTS.md")).not.toContain("monorepo")
      // Custom rules run through Oxlint, so the guidance needs a lint script.
      expect(files.read("AGENTS.md")).not.toContain(".adamantite/rules")

      yield* runWriteAgentsGuidance(files, {
        isMonorepo: true,
        packageManager: "bun",
        scripts: ["analyze"],
      })

      const agents = files.read("AGENTS.md")
      expect(agents).toContain("It also checks monorepo package consistency.")
      expect(agents).toContain("Direct command: `adamantite analyze`")
    })
  )

  const ALL_SCRIPTS: Script[] = ["check", "fix", "analyze"]
  const guidanceOptions = {
    isMonorepo: Schema.Boolean,
    packageManager: Schema.Literals(["bun", "deno", "npm", "pnpm", "yarn"]),
    scripts: Schema.mutable(
      Schema.UniqueArray(Schema.Literals(ALL_SCRIPTS)).check(Schema.isMaxLength(ALL_SCRIPTS.length))
    ),
  }
  // Marker-free so generated content cannot collide with the managed block by accident.
  const markerFreeContent = Schema.String.check(Schema.isMaxLength(200)).check(
    Schema.makeFilter((content) => !content.includes("ADAMANTITE"))
  )

  it.effect.prop(
    "preserve marker-free content verbatim and append exactly one managed block",
    { ...guidanceOptions, existing: markerFreeContent },
    ({ existing, isMonorepo, packageManager, scripts }) =>
      Effect.gen(function* () {
        const files = makeFiles({ "AGENTS.md": existing })

        const result = yield* runWriteAgentsGuidance(files, { isMonorepo, packageManager, scripts })

        expect(result).toBe("updated")

        const agents = files.read("AGENTS.md")
        expect(agents.startsWith(existing)).toBe(true)
        expect(countOccurrences(agents, ADAMANTITE_AGENTS_START_MARKER)).toBe(1)
        expect(countOccurrences(agents, ADAMANTITE_AGENTS_END_MARKER)).toBe(1)
        expect(agents.endsWith("\n")).toBe(true)

        // The block body lists guidance for exactly the selected scripts, with commands that
        // invoke the selected package manager.
        for (const script of ALL_SCRIPTS) {
          expect(agents.includes(`Direct command: \`${MANAGED_SCRIPT_COMMANDS[script]}\`.`)).toBe(
            scripts.includes(script)
          )
        }
        if (scripts.length > 0) {
          expect(agents).toContain(`${packageManager} `)
        }
      }),
    { arbitrary: { runs: 150 } }
  )

  it.effect.prop(
    "write the same content no matter how often it runs",
    { ...guidanceOptions, existing: markerFreeContent },
    ({ existing, isMonorepo, packageManager, scripts }) =>
      Effect.gen(function* () {
        const files = makeFiles({ "AGENTS.md": existing })

        yield* runWriteAgentsGuidance(files, { isMonorepo, packageManager, scripts })
        const afterFirst = files.read("AGENTS.md")

        const result = yield* runWriteAgentsGuidance(files, { isMonorepo, packageManager, scripts })
        expect(result).toBe("updated")
        expect(files.read("AGENTS.md")).toBe(afterFirst)
      }),
    { arbitrary: { runs: 150 } }
  )

  it.effect.prop(
    "replace only the managed block, keeping surrounding content intact",
    { ...guidanceOptions, prefix: markerFreeContent, suffix: markerFreeContent },
    ({ isMonorepo, packageManager, prefix, scripts, suffix }) =>
      Effect.gen(function* () {
        const existing = `${prefix}${ADAMANTITE_AGENTS_START_MARKER}\nOLD-CONTENT-SENTINEL\n${ADAMANTITE_AGENTS_END_MARKER}${suffix}`
        const files = makeFiles({ "AGENTS.md": existing })

        const fresh = makeFiles()

        const result = yield* runWriteAgentsGuidance(files, { isMonorepo, packageManager, scripts })
        yield* runWriteAgentsGuidance(fresh, { isMonorepo, packageManager, scripts })

        const expected = `${prefix}${fresh.read("AGENTS.md").trimEnd()}${suffix}`
        expect(result).toBe("updated")
        expect(files.read("AGENTS.md")).toBe(expected.endsWith("\n") ? expected : `${expected}\n`)
      }),
    { arbitrary: { runs: 150 } }
  )

  it.effect.prop(
    "report malformed markers without touching the file",
    {
      ...guidanceOptions,
      prefix: markerFreeContent,
      suffix: markerFreeContent,
      variant: Schema.Literals(["start-only", "end-only", "end-before-start"]),
    },
    ({ isMonorepo, packageManager, prefix, scripts, suffix, variant }) =>
      Effect.gen(function* () {
        const existing =
          variant === "start-only"
            ? `${prefix}${ADAMANTITE_AGENTS_START_MARKER}${suffix}`
            : variant === "end-only"
              ? `${prefix}${ADAMANTITE_AGENTS_END_MARKER}${suffix}`
              : `${prefix}${ADAMANTITE_AGENTS_END_MARKER}\n${ADAMANTITE_AGENTS_START_MARKER}${suffix}`
        const files = makeFiles({ "AGENTS.md": existing })

        const result = yield* runWriteAgentsGuidance(files, { isMonorepo, packageManager, scripts })

        expect(result).toBe("malformed")
        expect(files.read("AGENTS.md")).toBe(existing)
      }),
    { arbitrary: { runs: 150 } }
  )
})
