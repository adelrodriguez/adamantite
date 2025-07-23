import process from "node:process"
import { runProcess } from "../utils"

export default function format(files: string[], options: { unsafe: boolean }) {
  try {
    const args = ["@biomejs/biome", "check", "--write"]

    if (options.unsafe) {
      args.push("--unsafe")
    }

    if (files.length > 0) {
      args.push(...files)
    }

    runProcess("npx", args)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown error occurred"

    // biome-ignore lint/suspicious/noConsole: We want to log the error to the console
    console.error("Failed to run Adamantite:", message)

    process.exit(1)
  }
}
