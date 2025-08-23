import { execSync } from "node:child_process"
import { dlxCommand } from "nypm"
import { getPackageManagerName, handleCommandError } from "../utils"

export default async function monorepo() {
  try {
    const packageManager = await getPackageManagerName()

    execSync(dlxCommand(packageManager, "sherif", { args: ["--fix"] }), {
      stdio: "inherit",
    })
  } catch (error) {
    handleCommandError(error)
  }
}
