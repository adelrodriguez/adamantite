import { execSync } from "node:child_process"
import { dlxCommand } from "nypm"
import { getPackageManagerName, handleCommandError } from "../utils"

export default async function check(
  files: string[],
  { summary }: { summary?: boolean }
) {
  try {
    const packageManager = await getPackageManagerName()

    const args = ["check"]

    if (summary) {
      args.push("--reporter", "summary")
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
