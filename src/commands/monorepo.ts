import process from "node:process"
import { detectPackageManager, getExecutablePath, runProcess } from "../utils"

export default async function monorepo() {
  try {
    const packageManager = await detectPackageManager()
    const executablePath = getExecutablePath(packageManager)

    runProcess(executablePath, ["sherif", "--fix"])
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred"

    // biome-ignore lint/suspicious/noConsole: We want to log the error to the console
    console.error("Failed to run Adamantite:", message)

    process.exit(1)
  }
}
