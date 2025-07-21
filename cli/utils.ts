import { type ExecSyncOptions, execSync } from "node:child_process"

export function runProcess(
  command: string,
  args: string[] = [],
  options: Omit<ExecSyncOptions, "stdio"> = {}
) {
  const commandWithArgs = `${command} ${args.join(" ")}`

  execSync(commandWithArgs, { ...options, stdio: "inherit" })
}
