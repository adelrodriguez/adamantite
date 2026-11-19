import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { readAgentReach } from "#lib/hardening/agent-reach.ts"
import { FailedToReadFile } from "#lib/shared/errors.ts"

describe("readAgentReach", () => {
  it.effect("fail when an AGENTS.md file cannot be read, instead of reaching nothing", () => {
    const context = createFileSystemTestContext({
      files: { "AGENTS.md": "See `GLOSSARY.md`.\n", "GLOSSARY.md": "# Glossary\n" },
    })

    context.makeUnreadable("AGENTS.md")

    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        readAgentReach(context.root, ["AGENTS.md", "GLOSSARY.md"], ["AGENTS.md"])
      )

      expect(error).toBeInstanceOf(FailedToReadFile)
    }).pipe(Effect.provide([context.layer, Path.layer]))
  })

  it.effect("treat a listed file that is gone as empty", () =>
    Effect.gen(function* () {
      const context = createFileSystemTestContext({ files: { "AGENTS.md": "# Agents\n" } })

      const reach = yield* readAgentReach(
        context.root,
        ["AGENTS.md", "docs/deleted.md"],
        ["AGENTS.md"]
      ).pipe(Effect.provide([context.layer, Path.layer]))

      expect(reach).toStrictEqual({
        brokenLinks: [],
        unmatchedAnchors: [],
        unreached: ["docs/deleted.md"],
      })
    })
  )

  it.effect.each([
    {
      // A heading of 25 collapsed reference links, which GitHub renders as 25 `x`.
      heading: `${"[x][]".repeat(25)}\n\n[x]: https://example.com`,
      matched: "x".repeat(25),
      name: "25 collapsed reference links",
    },
    {
      heading: `${"](<a {# _ ".repeat(20_000)}${"{#x".repeat(200_000)}${"#".repeat(20_000)}tail`,
      matched: "top",
      name: "a very long heading of unclosed markup",
    },
  ])("list the anchors of a heading of $name", ({ heading, matched }) =>
    Effect.gen(function* () {
      const context = createFileSystemTestContext({
        files: { "AGENTS.md": `## ${heading}\n\n[a](#${matched}) [b](#nowhere)\n` },
      })

      const reach = yield* readAgentReach(context.root, ["AGENTS.md"], ["AGENTS.md"]).pipe(
        Effect.provide([context.layer, Path.layer])
      )

      expect(reach.unmatchedAnchors).toStrictEqual([
        { anchor: "nowhere", file: "AGENTS.md", target: "AGENTS.md" },
      ])
    })
  )
})
