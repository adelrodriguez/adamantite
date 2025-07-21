import { type ExecSyncOptions, execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export function runProcess(
  command: string,
  args: string[] = [],
  options: Omit<ExecSyncOptions, "stdio"> = {}
) {
  const commandWithArgs = `${command} ${args.join(" ")}`

  execSync(commandWithArgs, { ...options, stdio: "inherit" })
}

export function getPackageVersion() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, "../package.json"), "utf-8")
  )

  return packageJson.version
}
