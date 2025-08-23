import process from "node:process"
import { detectPackageManager, getExecutablePath, runProcess } from "../utils"

export default async function format(
  files: string[],
  options: { unsafe?: boolean }
) {
  try {
    const packageManager = await detectPackageManager()
    const executablePath = getExecutablePath(packageManager)
    const args = ["@biomejs/biome", "check", "--write"]

    if (options.unsafe) {
      args.push("--unsafe")
    }

    if (files.length > 0) {
      args.push(...files)
    }

    runProcess(executablePath, args)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred"

    // biome-ignore lint/suspicious/noConsole: We want to log the error to the console
    console.error("Failed to run Adamantite:", message)

    process.exit(1)
  }
}
