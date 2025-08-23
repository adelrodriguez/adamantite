import { execSync } from "node:child_process"
import { dlxCommand } from "nypm"
import { getPackageManagerName, handleCommandError } from "../utils"

export default async function ci({
  github,
  monorepo,
}: {
  github?: boolean
  monorepo?: boolean
}) {
  try {
    const packageManager = await getPackageManagerName()

    const tools = [
      {
        package: "@biomejs/biome",
        args: ["ci", ...(github ? ["--reporter", "github"] : [])],
      },
      ...(monorepo ? [{ package: "sherif", args: [] }] : []),
    ]

    for (const tool of tools) {
      execSync(dlxCommand(packageManager, tool.package, { args: tool.args }), {
        stdio: "inherit",
      })
    }
  } catch (error) {
    handleCommandError(error)
  }
}
