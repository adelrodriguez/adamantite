import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { readAgentReach } from "#lib/hardening/agent-reach.ts"
import { FailedToReadFile } from "#lib/shared/errors.ts"

// The reach that harden computes is tested through `harden --json`. These cases are states that
// the command does not create: harden leaves out a listed file that is gone, and a test cannot make
// a file of the command unreadable.
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

      expect(reach).toStrictEqual({ brokenLinks: [], unreached: ["docs/deleted.md"] })
    })
  )
})
