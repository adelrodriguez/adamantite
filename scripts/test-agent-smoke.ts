import { spawnSync } from "node:child_process"
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
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

// Mirrors `detectAgent`: another CLI can own the `agent` command, so Cursor must print a date version.
function findInstalledCommand(agent: string, commands: readonly string[]): string | null {
  for (const command of commands) {
    const result = spawnSync(command, [command === "grok" ? "version" : "--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    })
    const isExpectedCli = agent !== "cursor" || /^\d{4}\.\d{2}\./u.test(result.stdout.trim())
    if (result.error === undefined && isExpectedCli) {
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

const installedCommand = findInstalledCommand(requested, commands)
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

  // The repaired configuration files import `adamantite`, `oxlint`, and `oxfmt`. The fixture
  // links this checkout and its installed tools, so it needs no package-manager install.
  // The `adamantite` package holds only the manifest and `dist`, so Oxlint does not find this
  // repository's own nested configuration.
  const packageDirectory = join(target, "node_modules", "adamantite")
  mkdirSync(packageDirectory, { recursive: true })
  cpSync(join(repoRoot, "package.json"), join(packageDirectory, "package.json"))
  symlinkSync(join(repoRoot, "dist"), join(packageDirectory, "dist"), "dir")
  for (const name of ["oxfmt", "oxlint", "oxlint-tsgolint"]) {
    symlinkSync(join(repoRoot, "node_modules", name), join(target, "node_modules", name), "dir")
  }

  const binDirectory = join(target, ".bin")
  mkdirSync(binDirectory)
  const wrapper = join(binDirectory, "adamantite")
  writeFileSync(
    wrapper,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(cliPath)} "$@"\n`
  )
  chmodSync(wrapper, 0o755)
  const env = {
    ...process.env,
    PATH: [binDirectory, join(repoRoot, "node_modules", ".bin"), process.env.PATH ?? ""].join(
      delimiter
    ),
  }

  runAdamantite(target, env, ["doctor", "--agent", requested, "--allow-dirty"])
  console.info("PASS doctor convergence")
  runAdamantite(target, env, ["doctor"])
  console.info("PASS doctor second run")
  runAdamantite(target, env, ["fix", "--agent", requested])
  console.info("PASS fix convergence")
} finally {
  rmSync(target, { force: true, recursive: true })
}
