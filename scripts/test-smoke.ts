import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import process from "node:process"

const repoRoot = join(import.meta.dirname, "..")
const cliPath = join(repoRoot, "bin", "adamantite")

interface RunOptions {
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
}

function spawn(command: string, args: string[], options: RunOptions) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    // A dependency install can exceed Node's 1 MiB default and would surface as a
    // misleading generic failure; a stuck install should fail here, not eat the CI job.
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5 * 60 * 1000,
  })

  const output = `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`

  // A failed launch sets `error` with no output; a timeout or a `maxBuffer` overrun sets it
  // after the command already produced some.
  if (result.error) {
    throw new Error(`Command did not finish: ${command} ${args.join(" ")}\n${output}`, {
      cause: result.error,
    })
  }

  return {
    description: `${command} ${args.join(" ")}`,
    output,
    status: result.status,
    stdout: result.stdout,
  }
}

function run(command: string, args: string[], options: RunOptions) {
  const result = spawn(command, args, options)

  if (result.status !== 0) {
    throw new Error(`Command failed: ${result.description}\n${result.output}`)
  }

  return result.stdout
}

function runExpectingFailure(command: string, args: string[], options: RunOptions) {
  const result = spawn(command, args, options)

  if (result.status === 0 || result.status === null) {
    throw new Error(`Expected a non-zero exit from: ${result.description}\n${result.output}`)
  }

  return { output: result.output, status: result.status }
}

/**
 * Sherif refuses to fix inside a CI environment, which it detects from these variables.
 */
function withoutCiVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) =>
        !["BUILD_NUMBER", "CI", "CI_NAME", "CONTINUOUS_INTEGRATION", "RUN_ID"].includes(name)
        && !name.startsWith("GITHUB_")
    )
  )
}

function assertIncludes(output: string, expected: string) {
  if (!output.includes(expected)) {
    throw new Error(`Expected output to contain ${JSON.stringify(expected)}, received:\n${output}`)
  }
}

function writeWorkspacePackage(root: string, name: string, dependencyVersion: string) {
  const directory = join(root, "packages", name)

  mkdirSync(join(directory, "src"), { recursive: true })
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify(
      {
        dependencies: { "is-number": dependencyVersion },
        exports: "./src/index.ts",
        name: `@adamantite-smoke/${name}`,
        private: true,
        type: "module",
        version: "0.0.0",
      },
      null,
      2
    )
  )
  writeFileSync(
    join(directory, "src", "index.ts"),
    'import isNumber from "is-number"\n\nexport default function check(value: unknown): boolean {\n  return isNumber(value)\n}\n'
  )
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
const monorepoFixture = mkdtempSync(join(tmpdir(), "adamantite-smoke-monorepo-"))
// SAFETY: the repository's package.json pins every managed tool in devDependencies.
const sherifVersion = (
  JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    devDependencies: Record<string, string>
  }
).devDependencies["sherif"]

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

  // Prove the swap took: a silent no-op would validate the published presets instead of
  // this checkout's, which is the one thing the tarball install exists to prevent.
  assertFileContains(join(fixture, "package.json"), '"adamantite": "file:')

  assertFileContains(join(fixture, "oxlint.config.ts"), "adamantite/lint")
  assertFileContains(join(fixture, "oxfmt.config.ts"), "adamantite/format")
  assertFileContains(join(fixture, "knip.config.ts"), "adamantite/analyze")
  assertFileContains(join(fixture, "tsconfig.json"), "adamantite/typescript")
  assertFileContains(join(fixture, "AGENTS.md"), "<!-- ADAMANTITE:START -->")
  assertFileContains(join(fixture, ".github", "workflows", "adamantite.yml"), "runs-on")
  assertFileContains(join(fixture, "package.json"), '"check": "adamantite check"')
  assertFileContains(join(fixture, "package.json"), '"analyze": "adamantite analyze"')

  // The commands resolve tool binaries through PATH, matching how package scripts run them.
  const fixtureEnv = {
    ...process.env,
    PATH: `${join(fixture, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
  }

  for (const command of ["fix", "check", "format", "analyze"]) {
    console.info(`Running \`adamantite ${command}\` with the real tool binaries...`)
    run(process.execPath, [cliPath, command], { cwd: fixture, env: fixtureEnv })
  }

  // The monorepo fixture uses pnpm: init installs at the workspace root there, and the
  // pnpm-workspace.yaml that skips the msgpackr-extract build is what marks it as a monorepo.
  const pnpmVersion = run("pnpm", ["--version"], { cwd: repoRoot }).trim()

  writeFileSync(
    join(monorepoFixture, "package.json"),
    JSON.stringify(
      {
        name: "adamantite-smoke-monorepo",
        packageManager: `pnpm@${pnpmVersion}`,
        private: true,
        version: "0.0.0",
      },
      null,
      2
    )
  )
  writeFileSync(
    join(monorepoFixture, "pnpm-workspace.yaml"),
    'packages:\n  - "packages/*"\nignoredBuiltDependencies:\n  - msgpackr-extract\n'
  )
  writeWorkspacePackage(monorepoFixture, "first", "7.0.0")
  writeWorkspacePackage(monorepoFixture, "second", "6.0.0")

  console.info("Running `adamantite init` against the monorepo fixture...")
  run(
    process.execPath,
    [cliPath, "init", "--non-interactive", "--script", "check", "--script", "analyze"],
    { cwd: monorepoFixture }
  )
  run(
    "pnpm",
    [
      "add",
      "--save-dev",
      "--workspace-root",
      join(packDirectory, tarball),
      `sherif@${sherifVersion}`,
    ],
    { cwd: monorepoFixture }
  )
  assertFileContains(join(monorepoFixture, "package.json"), '"adamantite": "file:')

  const monorepoEnv = {
    ...process.env,
    PATH: `${join(monorepoFixture, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
  }

  // Exit 0 proves Knip, under the preset defaults, reports neither `sherif` nor
  // `oxlint-tsgolint` as an unused devDependency: no script or import references them.
  console.info("Running `adamantite analyze --only unused` in the monorepo fixture...")
  const unusedOutput = run(process.execPath, [cliPath, "analyze", "--only", "unused"], {
    cwd: monorepoFixture,
    env: monorepoEnv,
  })

  if (unusedOutput.includes("(sherif)")) {
    throw new Error(`Expected \`--only unused\` not to run Sherif, received:\n${unusedOutput}`)
  }

  console.info("Running `adamantite analyze` against the version mismatch...")
  const analysis = runExpectingFailure(process.execPath, [cliPath, "analyze"], {
    cwd: monorepoFixture,
    env: monorepoEnv,
  })

  if (analysis.status !== 1) {
    throw new Error(`Expected \`analyze\` to exit 1, received ${analysis.status}`)
  }

  assertIncludes(analysis.output, "(sherif)")
  assertIncludes(analysis.output, "multiple-dependency-versions")
  assertIncludes(analysis.output, "(knip)")

  console.info("Running `adamantite analyze --only monorepo --fix`...")
  const fixOutput = run(
    process.execPath,
    [
      cliPath,
      "analyze",
      "--only",
      "monorepo",
      "--fix",
      "--",
      "--select",
      "highest",
      "--no-install",
    ],
    { cwd: monorepoFixture, env: withoutCiVariables(monorepoEnv) }
  )

  if (fixOutput.includes("(knip)")) {
    throw new Error(`Expected \`--only monorepo\` not to run Knip, received:\n${fixOutput}`)
  }

  assertFileContains(join(monorepoFixture, "packages", "second", "package.json"), '"7.0.0"')

  console.info("Smoke test passed: init output is accepted by the pinned tool versions.")
} catch (error) {
  console.info(`Fixtures kept for debugging at: ${fixture} and ${monorepoFixture}`)
  throw error
} finally {
  rmSync(packDirectory, { force: true, recursive: true })
}

rmSync(fixture, { force: true, recursive: true })
rmSync(monorepoFixture, { force: true, recursive: true })
