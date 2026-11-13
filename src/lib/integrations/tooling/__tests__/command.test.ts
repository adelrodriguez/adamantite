import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import * as Array from "effect/Array"
import * as Order from "effect/Order"
import { describe, expect, it } from "vitest"
import * as knipCommands from "#lib/integrations/tooling/knip/command.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import * as oxfmtCommands from "#lib/integrations/tooling/oxfmt/command.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import * as oxlintCommands from "#lib/integrations/tooling/oxlint/command.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import * as sherifCommands from "#lib/integrations/tooling/sherif/command.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"

const TOOLING_DIR = join(import.meta.dirname, "..")

const toolFolders = readdirSync(TOOLING_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "__tests__")
  .map((entry) => entry.name)

const tools = [
  { commands: { ...knipCommands }, integration: knip, name: "knip" },
  { commands: { ...oxfmtCommands }, integration: oxfmt, name: "oxfmt" },
  { commands: { ...oxlintCommands }, integration: oxlint, name: "oxlint" },
  { commands: { ...sherifCommands }, integration: sherif, name: "sherif" },
]

describe("command builders", () => {
  it("cover every tool folder that has a command.ts", () => {
    const foldersWithCommands = toolFolders.filter((folder) =>
      existsSync(join(TOOLING_DIR, folder, "command.ts"))
    )

    // `readdirSync` gives the folders in no defined order.
    expect(
      Array.sort(
        tools.map((tool) => tool.name),
        Order.String
      )
    ).toStrictEqual(Array.sort(foldersWithCommands, Order.String))
  })

  it.each(toolFolders)("keep the builders of %s out of its index.ts", (folder) => {
    const source = readFileSync(join(TOOLING_DIR, folder, "index.ts"), "utf8")

    expect(source).not.toContain("CommandRunOptions")
  })

  it.each(tools)("attach each builder of $name to its integration", ({ commands, integration }) => {
    expect(Object.keys(commands)).not.toHaveLength(0)
    expect(integration).toMatchObject(commands)
  })
})
