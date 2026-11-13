import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { delimiter, join, sep } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

const repoRoot = join(import.meta.dirname, "..")
const cliPath = join(repoRoot, "bin", "adamantite")

interface RunOptions {
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
  readonly input?: string
}

function spawn(command: string, args: string[], options: RunOptions) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    input: options.input,
    // A dependency install can exceed Node's 1 MiB default and would surface as a
    // misleading generic failure; a stuck install should fail here, not eat the CI job.
    maxBuffer: 64 * 1024 * 1024,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
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

/**
 * Verify the scaffolded rule from stdin, then break it and confirm that verification fails. The
 * target project keeps only the rule, with no verification cases or fixtures.
 */
function addRuleAndVerify(cwd: string, env: NodeJS.ProcessEnv) {
  const rulePath = join(cwd, ".adamantite", "lint", "no-smoke.ts")

  assertIncludes(
    run(process.execPath, [cliPath, "rule", "add", "no-smoke"], { cwd, env }),
    "Wrote .adamantite/lint/no-smoke.ts."
  )

  const input = [
    'import { RuleTester } from "adamantite/rules/testing"',
    'import rule from "./.adamantite/lint/no-smoke.ts"',
    'new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } }).run("no-smoke", rule, {',
    '  invalid: [{ code: "debugger", errors: [{ messageId: "unexpected" }] }],',
    '  valid: ["const value: number = 1"],',
    "})",
  ].join("\n")

  const options = { cwd, env, input }
  const args = ["--input-type=module"]

  assertIncludes(run(process.execPath, args, options), "✔ debugger")
  const rule = readFileSync(rulePath, "utf8")

  writeFileSync(rulePath, rule.replace("DebuggerStatement", "WithStatement"))
  assertIncludes(runExpectingFailure(process.execPath, args, options).output, "✖ debugger")
  writeFileSync(rulePath, rule)

  const files = readdirSync(join(cwd, ".adamantite", "lint"))

  if (files.length !== 1 || files[0] !== "no-smoke.ts") {
    throw new Error(`Expected only the custom rule to remain, received: ${files.join(", ")}`)
  }

  // Add a saved test only on request. It must stay out of the runtime plugin.
  assertIncludes(
    runExpectingFailure(process.execPath, [cliPath, "rule", "test", "add", "missing"], { cwd, env })
      .output,
    "does not exist"
  )
  const testPath = join(cwd, ".adamantite", "lint", "no-smoke.test.ts")
  run(process.execPath, [cliPath, "rule", "test", "add", "no-smoke"], { cwd, env })

  try {
    assertIncludes(run(process.execPath, [cliPath, "rule", "test"], { cwd, env }), "✔ debugger")
    // Load the plugin without linting the monorepo's unrelated dependency-version fixtures.
    run(process.execPath, [cliPath, "check", "oxlint.config.ts", "--only", "lint"], { cwd, env })
  } finally {
    rmSync(testPath)
  }

  const customTest = join(cwd, "tests", "no-smoke.test.ts")
  run(process.execPath, [cliPath, "rule", "test", "add", "no-smoke", "--path", customTest], {
    cwd,
    env,
  })

  try {
    assertIncludes(
      run(process.execPath, [cliPath, "rule", "test", "--path", customTest], { cwd, env }),
      "✔ debugger"
    )
  } finally {
    rmSync(customTest)
  }
}

const InstalledManifest = Schema.Struct({
  exports: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Struct({ default: Schema.String, types: Schema.String })])
  ),
})

const decodeInstalledManifest = Schema.decodeUnknownSync(Schema.fromJsonString(InstalledManifest))

/**
 * Load each public import of the installed package from the project, and check its declaration
 * file. Every other built module, such as a lint plugin helper or the custom-rule loader, must stay
 * private, so a new file in the build never becomes a public import by accident.
 */
async function verifyPackageExports(cwd: string) {
  const packageRoot = join(cwd, "node_modules", "adamantite")

  const { exports } = decodeInstalledManifest(
    readFileSync(join(packageRoot, "package.json"), "utf8")
  )

  for (const [subpath, target] of Object.entries(exports)) {
    if (!Predicate.isString(target) && !existsSync(join(packageRoot, target.types))) {
      throw new Error(`The export ${subpath} names the missing declaration file ${target.types}`)
    }
  }

  const projectRequire = createRequire(join(cwd, "package.json"))

  const publicImports = new Set(
    Object.keys(exports).map((subpath) => `adamantite${subpath.slice(1)}`)
  )

  await Promise.all(
    [...publicImports].flatMap((specifier) => {
      const path = projectRequire.resolve(specifier)

      return path.endsWith(".js") ? [import(pathToFileURL(path).href)] : []
    })
  )

  const privateImports = [
    "adamantite",
    ...readdirSync(join(packageRoot, "dist", "presets"), {
      encoding: "utf8",
      recursive: true,
    }).flatMap((file) => {
      const specifier = `adamantite/${file.slice(0, -".js".length).split(sep).join("/")}`

      return file.endsWith(".js") && !publicImports.has(specifier) ? [specifier] : []
    }),
  ]

  for (const specifier of privateImports) {
    try {
      projectRequire.resolve(specifier)
    } catch (error) {
      if (Predicate.hasProperty(error, "code") && error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
        continue
      }

      throw error
    }

    throw new Error(`Expected the package to keep ${specifier} private`)
  }

  return privateImports
}

// The fixture uses npm and the monorepo fixture uses pnpm, so the smoke test covers both
// package managers.
const npmVersion = run("npm", ["--version"], { cwd: repoRoot }).trim()
const packDirectory = mkdtempSync(join(tmpdir(), "adamantite-smoke-pack-"))
const fixture = mkdtempSync(join(tmpdir(), "adamantite-smoke-"))
const monorepoFixture = mkdtempSync(join(tmpdir(), "adamantite-smoke-monorepo-"))
const effectFixture = mkdtempSync(join(tmpdir(), "adamantite-smoke-effect-"))

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

  // Install this checkout as the fixture's `adamantite` before init. Init keeps a dependency that
  // the project already has, so the run never installs `adamantite` from the registry.
  run("pnpm", ["pack", "--pack-destination", packDirectory], { cwd: repoRoot })
  const [tarball, ...extraTarballs] = readdirSync(packDirectory)

  if (!tarball || extraTarballs.length > 0) {
    throw new Error(`Expected exactly one packed tarball in ${packDirectory}`)
  }

  run("npm", ["install", "--save-dev", join(packDirectory, tarball)], { cwd: fixture })

  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'import architecture from "adamantite/lint/architecture"',
        'if (Object.keys(architecture.rules ?? {}).length > 0) throw new Error("The architecture preset must enable no rules")',
      ].join("\n"),
    ],
    { cwd: fixture }
  )

  console.info("Checking Effect editor setup after an install with scripts disabled...")
  writeFileSync(
    join(effectFixture, "package.json"),
    JSON.stringify({
      name: "adamantite-effect-editor-smoke",
      packageManager: `npm@${npmVersion}`,
      private: true,
      type: "module",
      version: "0.0.0",
    })
  )
  const effectEnv = { ...process.env, npm_config_ignore_scripts: "true" }
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--save-dev",
      join(packDirectory, tarball),
      "typescript@7.0.2",
      "effect@4.1.2",
    ],
    { cwd: effectFixture, env: effectEnv }
  )

  const typescriptResolver = join(
    effectFixture,
    "node_modules",
    "typescript",
    "lib",
    "getExePath.js"
  )

  const originalResolver = readFileSync(typescriptResolver, "utf8")

  const originalCompiler = run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "import getExePath from './node_modules/typescript/lib/getExePath.js'; process.stdout.write(getExePath())",
    ],
    { cwd: effectFixture, env: effectEnv }
  ).trim()

  const originalCompilerHash = createHash("sha256")
    .update(readFileSync(originalCompiler))
    .digest("hex")

  run(
    process.execPath,
    [
      cliPath,
      "init",
      "--non-interactive",
      "--script",
      "check",
      "--preset",
      "effect",
      "--typescript",
      "typescript",
      "--agents",
      "--editor",
      "vscode",
      "--editor",
      "zed",
    ],
    { cwd: effectFixture, env: effectEnv }
  )
  writeFileSync(
    join(effectFixture, "index.ts"),
    'import * as Effect from "effect/Effect"\n\nexport const value = Effect.succeed(1)\n'
  )
  const sdkDirectory = join(effectFixture, "node_modules", ".cache", "adamantite", "effect")
  const sdkCompiler = join(sdkDirectory, process.platform === "win32" ? "tsc.exe" : "tsc")
  assertIncludes(
    run(sdkCompiler, ["--version"], { cwd: effectFixture, env: effectEnv }),
    "effect-tsgo"
  )
  run(sdkCompiler, ["--noEmit", "--project", "tsconfig.json"], {
    cwd: effectFixture,
    env: effectEnv,
  })
  assertFileContains(
    join(effectFixture, ".vscode", "settings.json"),
    '"js/ts.tsdk.path": "node_modules/.cache/adamantite/effect"'
  )
  assertFileContains(
    join(effectFixture, ".vscode", "settings.json"),
    '"effecttsgo/global-json-in-effect"'
  )
  assertFileContains(join(effectFixture, ".zed", "settings.json"), '"typescript-ls"')
  assertFileContains(join(effectFixture, "tsconfig.json"), '"diagnostics": true')

  const serverFiles = run(
    process.execPath,
    [
      join(effectFixture, "node_modules", "@effect", "tsgo", "dist", "effect-tsgo.cjs"),
      "tsc",
      "--listFilesOnly",
      "--project",
      "tsconfig.json",
    ],
    { cwd: effectFixture, env: effectEnv }
  )

  assertIncludes(serverFiles, join(effectFixture, "index.ts"))
  run(process.execPath, [cliPath, "doctor"], { cwd: effectFixture, env: effectEnv })

  const effectWorkspacePackage = join(effectFixture, "packages", "app")
  mkdirSync(effectWorkspacePackage, { recursive: true })
  writeFileSync(
    join(effectWorkspacePackage, "package.json"),
    JSON.stringify({ name: "effect-workspace-package", private: true, type: "module" })
  )
  run(
    process.execPath,
    [cliPath, "init", "--non-interactive", "--script", "check", "--editor", "zed"],
    { cwd: effectWorkspacePackage, env: effectEnv }
  )
  const ancestorEffectCli = "../../node_modules/@effect/tsgo/dist/effect-tsgo.cjs"
  assertFileContains(
    join(effectWorkspacePackage, ".zed", "settings.json"),
    JSON.stringify(ancestorEffectCli)
  )
  assertIncludes(
    run(
      process.execPath,
      [ancestorEffectCli, "tsc", "--listFilesOnly", "--project", "../../tsconfig.json"],
      { cwd: effectWorkspacePackage, env: effectEnv }
    ),
    join(effectFixture, "index.ts")
  )

  rmSync(sdkDirectory, { force: true, recursive: true })
  assertIncludes(
    runExpectingFailure(process.execPath, [cliPath, "doctor"], {
      cwd: effectFixture,
      env: effectEnv,
    }).output,
    "The Effect editor SDK needs preparation"
  )
  run(
    process.execPath,
    [cliPath, "init", "--non-interactive", "--script", "check", "--editor", "vscode"],
    {
      cwd: effectFixture,
      env: effectEnv,
    }
  )
  run(process.execPath, [cliPath, "doctor"], { cwd: effectFixture, env: effectEnv })

  if (
    readFileSync(typescriptResolver, "utf8") !== originalResolver
    || createHash("sha256").update(readFileSync(originalCompiler)).digest("hex")
      !== originalCompilerHash
  ) {
    throw new Error("Effect editor setup changed the installed TypeScript package")
  }

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
      "--preset",
      "architecture",
      "--typescript",
      "typescript",
      "--agents",
      "--github-actions",
    ],
    { cwd: fixture }
  )

  // Prove init kept the tarball: a registry install would validate the published presets
  // instead of this checkout's.
  assertFileContains(join(fixture, "package.json"), '"adamantite": "file:')

  assertFileContains(join(fixture, "oxlint.config.ts"), "adamantite/lint")
  assertFileContains(join(fixture, "oxlint.config.ts"), "adamantite/lint/architecture")
  assertFileContains(join(fixture, "oxfmt.config.ts"), "adamantite/format")
  assertFileContains(join(fixture, "knip.config.ts"), "adamantite/analyze")
  assertFileContains(join(fixture, "tsconfig.json"), "adamantite/typescript")
  assertFileContains(join(fixture, "AGENTS.md"), "<!-- ADAMANTITE:START -->")
  assertFileContains(join(fixture, ".github", "workflows", "adamantite.yml"), "runs-on")
  assertFileContains(join(fixture, "package.json"), '"check": "adamantite check"')
  assertFileContains(join(fixture, "package.json"), '"analyze": "adamantite analyze"')

  console.info("Checking the public and private imports of the installed package...")
  const privateImports = await verifyPackageExports(fixture)

  for (const specifier of [
    "adamantite/lint/core",
    "adamantite/lint/plugins/shared/options",
    "adamantite/lint/plugins/rules/layers",
    "adamantite/rules/load",
  ]) {
    if (!privateImports.includes(specifier)) {
      throw new Error(`Expected the private import check to cover ${specifier}`)
    }
  }

  // The commands resolve tool binaries through PATH, matching how package scripts run them.
  const fixtureEnv = {
    ...process.env,
    PATH: `${join(fixture, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
  }

  console.info("Running `adamantite rule add` and temporary RuleTester verification...")
  addRuleAndVerify(fixture, fixtureEnv)

  // Check the generated config and custom rule, and keep the rule as a Knip entry file.
  for (const command of ["fix", "check", "analyze"]) {
    console.info(`Running \`adamantite ${command}\` with the real tool binaries...`)
    run(process.execPath, [cliPath, command], { cwd: fixture, env: fixtureEnv })
  }

  // `adamantite/typescript` loads the type resets by a path inside the installed
  // package, so `JSON.parse()` returns `unknown` for both TypeScript and the type-aware lint.
  console.info("Checking the type resets of the installed TypeScript preset...")
  const resetProbe = join(fixture, "src", "reset-probe.ts")
  writeFileSync(resetProbe, 'export const value: { a: number } = JSON.parse("{}")\n')

  for (const [command, args] of [
    ["tsc", ["--noEmit", "--project", "tsconfig.json"]],
    [process.execPath, [cliPath, "check", "--only", "lint"]],
  ] as const) {
    assertIncludes(
      runExpectingFailure(command, [...args], { cwd: fixture, env: fixtureEnv }).output,
      "Type 'unknown' is not assignable to type '{ a: number; }'"
    )
  }

  rmSync(resetProbe)

  // Doctor asks the installed TypeScript whether the config loads the type resets, so a public
  // package that publishes its types gets the library finding. The fixture is private otherwise.
  console.info("Checking that Doctor reports the type resets in a library...")
  const fixtureManifest = readFileSync(join(fixture, "package.json"), "utf8")

  const libraryManifest = JSON.stringify({
    ...JSON.parse(fixtureManifest),
    private: false,
    types: "./dist/index.d.ts",
  })

  writeFileSync(join(fixture, "package.json"), libraryManifest)
  assertIncludes(
    runExpectingFailure(process.execPath, [cliPath, "doctor"], { cwd: fixture, env: fixtureEnv })
      .output,
    "Type resets in a library"
  )
  writeFileSync(join(fixture, "package.json"), fixtureManifest)

  // Init installs at the workspace root in a monorepo, and pnpm-workspace.yaml marks the
  // fixture as one.
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
  writeFileSync(join(monorepoFixture, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n')
  writeWorkspacePackage(monorepoFixture, "first", "7.0.0")
  writeWorkspacePackage(monorepoFixture, "second", "6.0.0")

  run("pnpm", ["add", "--save-dev", "--workspace-root", join(packDirectory, tarball)], {
    cwd: monorepoFixture,
  })

  console.info("Running `adamantite init` against the monorepo fixture...")
  run(
    process.execPath,
    [cliPath, "init", "--non-interactive", "--script", "check", "--script", "analyze"],
    { cwd: monorepoFixture }
  )
  // Init installs Sherif with the `analyze` script in a monorepo.
  assertFileContains(join(monorepoFixture, "package.json"), '"sherif"')
  assertFileContains(join(monorepoFixture, "package.json"), '"adamantite": "file:')

  const monorepoEnv = {
    ...process.env,
    PATH: `${join(monorepoFixture, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
  }

  // Exit 0 proves Knip, under the preset defaults, reports neither `sherif` nor `tsrs` as an unused
  // devDependency, although no script or import references them. `tsrs` is an optional peer of
  // Adamantite, which Knip counts as a use.
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

  console.info(
    "Running `adamantite rule add` and temporary RuleTester verification in the monorepo..."
  )
  addRuleAndVerify(monorepoFixture, monorepoEnv)

  // Doctor resolves config imports with the real resolver. The root config loads a shared tooling
  // package through an `exports` subpath, so Doctor reaches its rules folder only by following the
  // installed workspace link, and reports the rule file that cannot load. The package's config
  // imports `./rules.js`, which exists beside `rules.ts`. Node.js loads the `.js` file, so Doctor
  // must follow it to `rules` and not to `source-rules`.
  const lintPackage = join(monorepoFixture, "packages", "lint")

  mkdirSync(join(lintPackage, "rules"), { recursive: true })
  writeFileSync(
    join(lintPackage, "package.json"),
    JSON.stringify(
      {
        exports: { "./config": "./config.ts" },
        name: "@adamantite-smoke/lint",
        private: true,
        type: "module",
        version: "0.0.0",
      },
      null,
      2
    )
  )
  writeFileSync(join(lintPackage, "config.ts"), 'export { default } from "./rules.js"\n')
  writeFileSync(
    join(lintPackage, "rules.js"),
    'import custom from "adamantite/rules"\n\nexport default custom({ dir: "rules", name: "smoke" })\n'
  )
  writeFileSync(
    join(lintPackage, "rules.ts"),
    'import custom from "adamantite/rules"\n\nexport default custom({ dir: "source-rules", name: "smoke" })\n'
  )
  writeFileSync(
    join(lintPackage, "rules", "no-enum.ts"),
    'import { defineRule } from "adamantite/rules/plugin"\n\nenum Kind { A }\n\nexport default defineRule({ create: () => ({}), meta: { kind: Kind.A } })\n'
  )
  run("pnpm", ["add", "--save-dev", "--workspace-root", "@adamantite-smoke/lint@workspace:*"], {
    cwd: monorepoFixture,
  })
  writeFileSync(
    join(monorepoFixture, "oxlint.config.ts"),
    'import { defineConfig } from "oxlint"\nimport core from "adamantite/lint"\nimport smoke from "@adamantite-smoke/lint/config"\n\nexport default defineConfig({ extends: [core, smoke] })\n'
  )

  console.info("Running `adamantite doctor` against a config that imports a workspace package...")

  const doctorOutput = spawn(process.execPath, [cliPath, "doctor"], {
    cwd: monorepoFixture,
    env: monorepoEnv,
  }).output

  assertIncludes(doctorOutput, "packages/lint/rules/no-enum.ts")

  if (doctorOutput.includes("Doctor cannot resolve")) {
    throw new Error(`Expected Doctor to resolve the workspace import, received:\n${doctorOutput}`)
  }

  console.info("Smoke test passed: init output is accepted by the pinned tool versions.")
} catch (error) {
  console.info(
    `Fixtures kept for debugging at: ${fixture}, ${monorepoFixture}, and ${effectFixture}`
  )
  throw error
} finally {
  rmSync(packDirectory, { force: true, recursive: true })
}

rmSync(fixture, { force: true, recursive: true })

rmSync(monorepoFixture, { force: true, recursive: true })

rmSync(effectFixture, { force: true, recursive: true })
