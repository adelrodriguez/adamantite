import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { parse as parseJsonc } from "jsonc-parser"
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
  for (const command of ["format", "monorepo", "prepare"]) {
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

// The TypeScript preset lists the type resets in `files`, by a path next to itself, and each reset
// file references the others by path. The build must copy every file that the preset loads.
const TypeScriptPreset = Schema.Struct({ files: Schema.Array(Schema.String) })
const typescriptPresetPath = join(import.meta.dirname, "..", "dist", "presets", "typescript.json")

const typescriptPreset = Schema.decodeUnknownSync(TypeScriptPreset)(
  parseJsonc(readFileSync(typescriptPresetPath, "utf8"))
)

/**
 * Returns the given declaration files and every file that they reference by path.
 */
function collectLoadedFiles(
  pending: readonly string[],
  loaded: ReadonlySet<string>
): ReadonlySet<string> {
  const unread = pending.filter((file) => !loaded.has(file))

  if (unread.length === 0) {
    return loaded
  }

  const references = unread.flatMap((file) => {
    if (!existsSync(file)) {
      throw new Error(`The built TypeScript preset loads ${file}, which the build did not copy`)
    }

    return [
      ...readFileSync(file, "utf8").matchAll(/^\/\/\/ <reference path="(?<path>[^"]+)" \/>$/gmu),
    ]
      .flatMap((match) => match.groups?.path ?? [])
      .map((path) => join(dirname(file), path))
  })

  return collectLoadedFiles(references, new Set([...loaded, ...unread]))
}

const loadedFiles = collectLoadedFiles(
  typescriptPreset.files.map((file) => join(dirname(typescriptPresetPath), file)),
  new Set()
)

console.info(`Verified the ${loadedFiles.size} type reset files of the built TypeScript preset`)

// Copied code keeps the license notice of its source, so every license file under `presets/` must
// ship at the same path under `dist/presets/`.
const sourcePresetDirectory = join(import.meta.dirname, "..", "presets")
const builtPresetDirectory = join(import.meta.dirname, "..", "dist", "presets")

const licenseFiles = readdirSync(sourcePresetDirectory, {
  encoding: "utf8",
  recursive: true,
}).filter((file) => /^license(?:\.md)?$/iu.test(basename(file)))

for (const file of licenseFiles) {
  if (!existsSync(join(builtPresetDirectory, file))) {
    throw new Error(
      `The source has the license notice presets/${file}, which the build did not copy`
    )
  }
}

console.info(`Verified the ${licenseFiles.length} license notices of the built presets`)
