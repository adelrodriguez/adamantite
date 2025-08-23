import process from "node:process"
import { detectPackageManager, getExecutablePath, runProcess } from "../utils"

export default async function ci({
  github,
  monorepo,
}: {
  github?: boolean
  monorepo?: boolean
}) {
  try {
    const packageManager = await detectPackageManager()
    const executablePath = getExecutablePath(packageManager)
    const args = ["@biomejs/biome", "ci"]

    if (github) {
      args.push("--reporter", "github")
    }

    // Run Biome CI
    runProcess(executablePath, args)

    if (monorepo) {
      // Run Sherif to fix monorepo-specific issues
      runProcess(executablePath, ["sherif"])
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred"

    // biome-ignore lint/suspicious/noConsole: We want to log the error to the console
    console.error("Failed to run Adamantite:", message)

    process.exit(1)
  }
}
