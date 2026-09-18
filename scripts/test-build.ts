import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import packageJson from "../package.json" with { type: "json" }

const cliPath = join(import.meta.dirname, "..", "bin", "adamantite")

const output = execFileSync(process.execPath, [cliPath, "--version"], {
  encoding: "utf8",
})
const expectedVersion = `adamantite v${packageJson.version}`

if (!output.includes(expectedVersion)) {
  throw new Error(
    `Expected the built CLI to print ${JSON.stringify(expectedVersion)}, received ${JSON.stringify(output.trim())}`
  )
}

// Report successful build verification in CI.
console.info(`Verified built CLI: ${expectedVersion}`)

const fixture = mkdtempSync(join(tmpdir(), "adamantite-cli-"))

try {
  for (const command of ["format", "monorepo"]) {
    const result = spawnSync(process.execPath, [cliPath, command], {
      cwd: fixture,
      encoding: "utf8",
    })
    if (result.status !== 1 || !result.stderr.includes(`Unknown subcommand "${command}"`)) {
      throw new Error(
        `Expected ${command} to fail as an unknown command: ${result.stdout}${result.stderr}`
      )
    }
  }

  for (const script of ["format", "check:monorepo", "fix:monorepo"]) {
    const result = spawnSync(
      process.execPath,
      [cliPath, "init", "--non-interactive", "--script", script],
      { cwd: fixture, encoding: "utf8" }
    )
    if (result.status !== 1 || !result.stderr.includes("Invalid value for flag --script")) {
      throw new Error(`Expected init to reject ${script}: ${result.stdout}${result.stderr}`)
    }
  }
} finally {
  rmSync(fixture, { force: true, recursive: true })
}
