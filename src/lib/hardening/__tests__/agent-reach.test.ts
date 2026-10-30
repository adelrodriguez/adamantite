import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { readAgentReach } from "#lib/hardening/agent-reach.ts"

function readReach(files: Record<string, string>) {
  const context = createFileSystemTestContext({ files })

  return readAgentReach(context.root, Object.keys(files)).pipe(
    Effect.provide(Layer.mergeAll(context.layer, Path.layer))
  )
}

describe("readAgentReach", () => {
  it.effect(
    "reach the files that links, imports, and code spans name, also through other files",
    () =>
      Effect.gen(function* () {
        const reach = yield* readReach({
          "AGENTS.md": "Read `GLOSSARY.md` and [the architecture](docs/architecture.md#layers).\n",
          "CLAUDE.md": "@AGENTS.md\n",
          "GLOSSARY.md": "# Glossary\n",
          "docs/architecture.md": "See [the testing guide](./guides/testing.md).\n",
          "docs/guides/testing.md": "# Testing\n",
          "docs/plans/old.md": "# Old plan\n",
          "src/README.md": "# Source\n",
        })

        expect(reach).toStrictEqual({
          agentFiles: ["AGENTS.md", "CLAUDE.md"],
          brokenLinks: [],
          hiddenAgentsFiles: [],
          unreached: ["docs/plans/old.md", "src/README.md"],
        })
      })
  )

  it.effect("reach each Markdown file directly in a folder that a file names", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({
        "AGENTS.md": "Record decisions in `docs/adr`, and keep `src/lib` in layers.\n",
        "docs/adr/0001-use-adamantite.md": "# Use Adamantite\n",
        "docs/adr/0002-use-effect.md": "# Use Effect\n",
        "docs/plans/old.md": "# Old plan\n",
        "src/lib/hardening/prompt.md": "# Prompt\n",
      })

      expect(reach.unreached).toStrictEqual(["docs/plans/old.md", "src/lib/hardening/prompt.md"])
    })
  )

  it.effect("start from the instruction files of each coding agent, also in subfolders", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({
        ".claude/rules/testing.md": "See `docs/testing.md`.\n",
        ".cursor/rules/style.mdc": "# Style\n",
        ".github/copilot-instructions.md": "# Copilot\n",
        "README.md": "# Acme\n",
        "docs/testing.md": "# Testing\n",
        "packages/web/AGENTS.md": "# Web\n",
      })

      expect(reach).toMatchObject({
        agentFiles: [
          ".claude/rules/testing.md",
          ".cursor/rules/style.mdc",
          ".github/copilot-instructions.md",
          "packages/web/AGENTS.md",
        ],
        unreached: ["README.md"],
      })
    })
  )

  it.effect("ignore a URL, an anchor, a package name, and a code span that names no file", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({
        "AGENTS.md":
          "Use [Effect](https://effect.website), see [below](#tests), install `@effect/vitest`, and run `pnpm run check`. Ask @maintainer.\n",
        "docs/testing.md": "# Testing\n",
      })

      expect(reach).toMatchObject({ brokenLinks: [], unreached: ["docs/testing.md"] })
    })
  )

  it.effect("list a link to a Markdown file that does not exist", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({
        "AGENTS.md": "Read [the guide](docs/guide.md), then `docs/missing-span.md`.\n",
      })

      // A code span can name a file that a step creates later, so only a link counts as broken.
      expect(reach.brokenLinks).toStrictEqual([{ file: "AGENTS.md", target: "docs/guide.md" }])
    })
  )

  it.effect(
    "list an AGENTS.md that a CLAUDE.md in its folder or above hides from Claude Code",
    () =>
      Effect.gen(function* () {
        const reach = yield* readReach({
          "AGENTS.md": "# Acme\n",
          "CLAUDE.md": "# Claude notes\n",
          "packages/web/AGENTS.md": "# Web\n",
        })

        expect(reach.hiddenAgentsFiles).toStrictEqual([
          { agents: "AGENTS.md", claude: "CLAUDE.md" },
          { agents: "packages/web/AGENTS.md", claude: "CLAUDE.md" },
        ])
      })
  )

  it.effect.each([
    { content: "@AGENTS.md\n", name: "imports it" },
    { content: "# Acme\n", name: "has the same content, as a symlink does" },
  ])("keep an AGENTS.md visible to Claude Code when the CLAUDE.md beside it $name", ({ content }) =>
    Effect.gen(function* () {
      const reach = yield* readReach({ "AGENTS.md": "# Acme\n", "CLAUDE.md": content })

      expect(reach.hiddenAgentsFiles).toStrictEqual([])
    })
  )

  it.effect("keep an AGENTS.md visible to Claude Code when no CLAUDE.md exists", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({ "AGENTS.md": "# Acme\n" })

      expect(reach.hiddenAgentsFiles).toStrictEqual([])
    })
  )
})
