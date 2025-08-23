import { execSync } from "node:child_process"
import { dlxCommand } from "nypm"
import { getPackageManagerName, handleCommandError } from "../utils"

export default async function format(
  files: string[],
  options: { unsafe?: boolean }
) {
  try {
    const packageManager = await getPackageManagerName()

    const args = ["check", "--write"]

    if (options.unsafe) {
      args.push("--unsafe")
    }

    if (files.length > 0) {
      args.push(...files)
    }

    execSync(dlxCommand(packageManager, "@biomejs/biome", { args }), {
      stdio: "inherit",
    })
  } catch (error) {
    handleCommandError(error)
  }
}
