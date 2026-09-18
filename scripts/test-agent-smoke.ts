import { spawnSync } from "node:child_process"
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import process from "node:process"

const agentCommands = {
  claude: ["claude"],
  codex: ["codex"],
  cursor: ["cursor-agent", "agent"],
  gemini: ["gemini"],
  grok: ["grok"],
  opencode: ["opencode"],
} as const

const repoRoot = join(import.meta.dirname, "..")
const cliPath = join(repoRoot, "bin", "adamantite")

function findInstalledCommand(commands: readonly string[]): string | null {
  for (const command of commands) {
    const result = spawnSync(command, [command === "grok" ? "version" : "--version"], {
      stdio: "ignore",
      timeout: 10_000,
    })
    if (result.error === undefined) {
      return command
    }
  }
  return null
}

function runAdamantite(cwd: string, env: NodeJS.ProcessEnv, args: string[]) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env,
    stdio: "inherit",
    timeout: 12 * 60 * 1000,
  })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`adamantite ${args.join(" ")} failed`, { cause: result.error })
  }
}

const requested = process.argv.slice(2).find((argument) => argument !== "--")
const commands = Object.entries(agentCommands).find(([name]) => name === requested)?.[1]
if (requested === undefined || commands === undefined) {
  throw new Error(`Usage: pnpm test:agents -- <${Object.keys(agentCommands).join("|")}>`)
}

const installedCommand = findInstalledCommand(commands)
if (installedCommand === null) {
  throw new Error(`${requested}: no supported command was found on PATH.`)
}

const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
const fixture = join(repoRoot, "scripts", "fixtures", "agent-smoke")
const target = mkdtempSync(join(tmpdir(), "adamantite-agent-smoke-"))

try {
  cpSync(fixture, target, { recursive: true })
  renameSync(join(target, "src", "index.ts.txt"), join(target, "src", "index.ts"))
  const manifestPath = join(target, "package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  manifest.devDependencies = {
    adamantite: rootManifest.version,
    oxfmt: rootManifest.devDependencies.oxfmt,
    oxlint: rootManifest.devDependencies.oxlint,
    "oxlint-tsgolint": rootManifest.devDependencies["oxlint-tsgolint"],
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const binDirectory = join(target, ".bin")
  mkdirSync(binDirectory)
  const wrapper = join(binDirectory, "adamantite")
  writeFileSync(
    wrapper,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(cliPath)} "$@"\n`
  )
  chmodSync(wrapper, 0o755)
  const env = { ...process.env, PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}` }

  runAdamantite(target, env, ["doctor", "--agent", requested, "--allow-dirty"])
  console.info("PASS doctor convergence")
  runAdamantite(target, env, ["doctor"])
  console.info("PASS doctor second run")
  runAdamantite(target, env, ["fix", "--agent", requested])
  console.info("PASS fix convergence")
} finally {
  rmSync(target, { force: true, recursive: true })
}
