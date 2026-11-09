import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import packageJson from "../package.json" with { type: "json" }
import { OXLINT_ENTRY_FILE } from "../src/lib/integrations/tooling/oxlint/entry.ts"

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

console.info(`Verified built CLI: ${expectedVersion}`)

// Editors start the entry from the target project's node_modules by this file name.
if (!existsSync(join(import.meta.dirname, "..", "dist", OXLINT_ENTRY_FILE))) {
  throw new Error(`Expected the build to write the Oxlint entry dist/${OXLINT_ENTRY_FILE}.`)
}

console.info(`Verified the Oxlint entry: dist/${OXLINT_ENTRY_FILE}`)

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

// A preset loads a vendored bundle or the first-party plugin by a file URL next to itself, so the
// build must copy each file that a built preset names. A package name, such as `@shadcn/lint`,
// resolves in the target project instead.
const PresetModule = Schema.Struct({
  default: Schema.Struct({
    jsPlugins: Schema.optional(
      Schema.Array(Schema.Union([Schema.String, Schema.Struct({ specifier: Schema.String })]))
    ),
  }),
})

const decodePresetModule = Schema.decodeUnknownSync(PresetModule)
const lintPresetDirectory = join(import.meta.dirname, "..", "dist", "presets", "lint")
const presetFiles = readdirSync(lintPresetDirectory).filter((name) => name.endsWith(".js"))

const presets = await Promise.all(
  presetFiles.map(async (file) => ({
    file,
    module: decodePresetModule(await import(pathToFileURL(join(lintPresetDirectory, file)).href)),
  }))
)

for (const { file, module } of presets) {
  const specifiers = (module.default.jsPlugins ?? []).map((plugin) =>
    Predicate.isString(plugin) ? plugin : plugin.specifier
  )

  for (const specifier of specifiers) {
    if (specifier.startsWith("file:") && !existsSync(fileURLToPath(specifier))) {
      throw new Error(`The built preset ${file} loads ${specifier}, which the build did not copy`)
    }
  }
}

console.info("Verified the plugin files of the built lint presets")
