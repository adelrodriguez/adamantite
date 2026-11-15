import { readdirSync } from "node:fs"
import { join } from "node:path"
import * as Array from "effect/Array"
import * as Order from "effect/Order"
import { describe, expect, it } from "vitest"
import * as oxlintCommands from "#lib/integrations/tooling/oxlint/command.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import oxlintIndex from "../oxlint/index.ts?raw"

const toolFolders = readdirSync(join(import.meta.dirname, ".."), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "__tests__")
  .map((entry) => entry.name)

const tools = [
  { commands: { ...oxlintCommands }, index: oxlintIndex, integration: oxlint, name: "oxlint" },
]

describe("command builders", () => {
  it("cover every tool folder", () => {
    // `readdirSync` gives the folders in no defined order.
    expect(
      Array.sort(
        tools.map((tool) => tool.name),
        Order.String
      )
    ).toStrictEqual(Array.sort(toolFolders, Order.String))
  })

  it.each(tools)("keep the builders of $name out of its index.ts", ({ index }) => {
    expect(index).not.toContain("CommandRunOptions")
  })

  it.each(tools)("attach each builder of $name to its integration", ({ commands, integration }) => {
    expect(Object.keys(commands)).not.toHaveLength(0)
    expect(integration).toMatchObject(commands)
  })
})
