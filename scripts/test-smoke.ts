import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import process from "node:process"

const repoRoot = join(import.meta.dirname, "..")
const cliPath = join(repoRoot, "bin", "adamantite")

function run(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    // SAFETY: execFileSync errors carry the child process's captured stdout and stderr.
    const output = error as { stdout?: string; stderr?: string }
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n--- stdout ---\n${output.stdout ?? ""}\n--- stderr ---\n${output.stderr ?? ""}`,
      { cause: error }
    )
  }
}

function assertFileContains(path: string, expected: string) {
  const content = readFileSync(path, "utf8")

  if (!content.includes(expected)) {
    throw new Error(
      `Expected ${path} to contain ${JSON.stringify(expected)}, received:\n${content}`
    )
  }
}

// The fixture uses npm: pnpm >= 10 fails `pnpm add` with ERR_PNPM_IGNORED_BUILDS because
// adamantite -> @effect/platform-node -> msgpackr -> msgpackr-extract has a build script,
// and approving it requires a pnpm-workspace.yaml, which init would misread as a monorepo.
const npmVersion = run("npm", ["--version"], { cwd: repoRoot }).trim()
const packDirectory = mkdtempSync(join(tmpdir(), "adamantite-smoke-pack-"))
const fixture = mkdtempSync(join(tmpdir(), "adamantite-smoke-"))

try {
  writeFileSync(
    join(fixture, "package.json"),
    JSON.stringify(
      {
        name: "adamantite-smoke-fixture",
        packageManager: `npm@${npmVersion}`,
        private: true,
        version: "0.0.0",
      },
      null,
      2
    )
  )
  mkdirSync(join(fixture, "src"))
  writeFileSync(
    join(fixture, "src", "index.ts"),
    "export function add(left: number, right: number): number {\n  return left + right\n}\n"
  )

  console.info("Running `adamantite init` against the fixture project...")
  run(
    process.execPath,
    [
      cliPath,
      "init",
      "--non-interactive",
      "--script",
      "check",
      "--script",
      "format",
      "--script",
      "analyze",
      "--typescript",
      "--agents",
      "--github-actions",
    ],
    { cwd: fixture }
  )

  // Init installs the published `adamantite` package; swap in the local build so the
  // generated configs exercise this checkout's presets and package exports.
  run("pnpm", ["pack", "--pack-destination", packDirectory], { cwd: repoRoot })
  const [tarball, ...extraTarballs] = readdirSync(packDirectory)

  if (!tarball || extraTarballs.length > 0) {
    throw new Error(`Expected exactly one packed tarball in ${packDirectory}`)
  }

  run("npm", ["install", "--save-dev", join(packDirectory, tarball)], { cwd: fixture })

  assertFileContains(join(fixture, "oxlint.config.ts"), "adamantite/lint")
  assertFileContains(join(fixture, "oxfmt.config.ts"), "adamantite/format")
  assertFileContains(join(fixture, "knip.config.ts"), "adamantite/analyze")
  assertFileContains(join(fixture, "tsconfig.json"), "adamantite/typescript")
  assertFileContains(join(fixture, "AGENTS.md"), "<!-- ADAMANTITE:START -->")
  assertFileContains(join(fixture, ".github", "workflows", "adamantite.yml"), "runs-on")
  assertFileContains(join(fixture, "package.json"), '"check": "adamantite check"')
  assertFileContains(join(fixture, "package.json"), '"format": "adamantite format"')
  assertFileContains(join(fixture, "package.json"), '"analyze": "adamantite analyze"')

  // The commands resolve tool binaries through PATH, matching how package scripts run them.
  const fixtureEnv = {
    ...process.env,
    PATH: `${join(fixture, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
  }

  for (const command of ["check", "format", "analyze"]) {
    console.info(`Running \`adamantite ${command}\` with the real tool binaries...`)
    run(process.execPath, [cliPath, command], { cwd: fixture, env: fixtureEnv })
  }

  console.info("Smoke test passed: init output is accepted by the pinned tool versions.")
} catch (error) {
  console.info(`Fixture kept for debugging at: ${fixture}`)
  throw error
} finally {
  rmSync(packDirectory, { force: true, recursive: true })
}

rmSync(fixture, { force: true, recursive: true })
