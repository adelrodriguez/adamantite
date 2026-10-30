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
  it.effect("reach the files that links and code spans name, also through other files", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({
        "AGENTS.md": "Read `GLOSSARY.md` and [the architecture](docs/architecture.md#layers).\n",
        "GLOSSARY.md": "# Glossary\n",
        "docs/architecture.md": "See [the testing guide](./guides/testing.md).\n",
        "docs/guides/testing.md": "# Testing\n",
        "docs/plans/old.md": "# Old plan\n",
        "src/README.md": "# Source\n",
      })

      expect(reach).toStrictEqual({
        brokenLinks: [],
        unreached: ["docs/plans/old.md", "src/README.md"],
      })
    })
  )

  it.effect("start from each AGENTS.md, and not from the files of one vendor", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({
        ".cursor/rules/style.mdc": "See `docs/style.md`.\n",
        "CLAUDE.md": "See `docs/testing.md`.\n",
        "docs/style.md": "# Style\n",
        "docs/testing.md": "# Testing\n",
        "packages/web/AGENTS.md": "See [the web guide](docs/guide.md).\n",
        "packages/web/docs/guide.md": "# Web\n",
      })

      expect(reach.unreached).toStrictEqual([
        ".cursor/rules/style.mdc",
        "CLAUDE.md",
        "docs/style.md",
        "docs/testing.md",
      ])
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

  it.effect("ignore a URL, an anchor, a package name, and a code span that names no file", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({
        "AGENTS.md":
          "Use [Effect](https://effect.website), see [below](#tests), install `@effect/vitest`, and run `pnpm run check`.\n",
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

  it.effect("ignore the links of an example in a code block or in inline code", () =>
    Effect.gen(function* () {
      const reach = yield* readReach({
        "AGENTS.md": [
          "Write a pointer like `[the guide](docs/example.md)`:",
          "",
          "```markdown",
          "Read [the guide](docs/fenced.md).",
          "```",
          "",
          "~~~",
          "[style]: docs/style.md",
          "~~~",
          "",
        ].join("\n"),
        "docs/style.md": "# Style\n",
      })

      expect(reach).toMatchObject({ brokenLinks: [], unreached: ["docs/style.md"] })
    })
  )
})
