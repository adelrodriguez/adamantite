/**
 * Re-vendors third-party oxlint plugins into the presets that ship them.
 *
 * Some plugins are deliberately not published to npm — their distribution model is "copy the source
 * into your repo" — and some publish a package whose dependencies serve only another linter. In
 * both cases Adamantite ships a bundled build instead of declaring a dependency. Each bundle
 * inlines the plugin's dependencies so the vendored file is fully self-contained. Those inlined
 * versions are pinned by the upstream lockfile; if an upstream ever drops its lockfile, a re-vendor
 * at the same pinned ref can inline different dependency versions, so read re-vendor diffs with
 * that in mind.
 *
 * Usage: node scripts/vendor-plugins.ts [name]
 *
 * Clones each upstream at its pinned commit, installs its dependencies, bundles the entry point to
 * ESM, and rewrites plugin.mjs, plugin.d.mts, license.md, and any companion files in the preset's
 * directory. After bumping a pinned ref, review the upstream diff and update the rules in the
 * owning preset if rules were added, removed, or renamed (the preset's drift test will catch a
 * mismatch).
 */
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import * as Schema from "effect/Schema"
import { build } from "tsdown"

const execFileAsync = promisify(execFile)
const maxCommandOutputBytes = 10 * 1024 * 1024

const UpstreamPackageJson = Schema.Struct({ packageManager: Schema.String })
const decodeUpstreamPackageJson = Schema.decodeUnknownSync(UpstreamPackageJson)

interface CompanionFile {
  /**
   * Bundle entry point, relative to the upstream repository root.
   */
  readonly entry: string
  /**
   * Output file name. The plugin finds the file by this name beside plugin.mjs at runtime.
   */
  readonly fileName: string
}

interface VendoredPlugin {
  /**
   * Files the plugin loads by URL at runtime, such as a worker thread script. Each one is bundled
   * on its own, so it is self-contained like plugin.mjs.
   */
  readonly companionFiles?: readonly CompanionFile[]
  /**
   * Bundle entry point, relative to the upstream repository root.
   */
  readonly entry: string
  /**
   * Named export of the entry that holds the plugin. Omit it when the plugin is the default export.
   */
  readonly exportName?: string
  readonly name: string
  /**
   * Output directory, relative to this repository's root.
   */
  readonly outDir: string
  readonly pinnedRef: string
  readonly repoUrl: string
}

const VENDORED_PLUGINS: VendoredPlugin[] = [
  {
    entry: "src/index.ts",
    name: "anti-slop",
    outDir: "presets/lint/vendor/antislop",
    pinnedRef: "e8c4880471b23ab7f216fba7b27d173a6ef07d4c",
    repoUrl: "https://github.com/dmmulroy/anti-slop.git",
  },
  {
    // The worker hosts Tailwind for no-unknown-classes. The plugin looks for it by this name beside
    // plugin.mjs, and falls back to its bundled grammar when the file is missing.
    companionFiles: [
      { entry: "packages/lint/src/tailwind/worker.ts", fileName: "tailwind-worker.js" },
    ],
    // src/index.ts also exports project tooling and ESLint types. The plugin alone is a named
    // export of src/plugin.ts.
    entry: "packages/lint/src/plugin.ts",
    exportName: "plugin",
    name: "shadcn",
    outDir: "presets/lint/vendor/shadcn",
    // @shadcn/lint@0.1.3
    pinnedRef: "44604c49c1d38ef78c0aef5bbfbd9a44bd9ef623",
    repoUrl: "https://github.com/shadcn-ui/lint.git",
  },
]

async function run(command: string, args: string[], cwd: string) {
  return execFileAsync(command, args, { cwd, maxBuffer: maxCommandOutputBytes })
}

async function installUpstreamDependencies(cwd: string) {
  const packageJson = decodeUpstreamPackageJson(
    JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"))
  )
  const packageManager = packageJson.packageManager

  if (!/^pnpm@\d/.test(packageManager)) {
    throw new Error(`Unsupported vendored plugin package manager: ${packageManager}`)
  }

  await run("pnpm", ["dlx", packageManager, "install", "--prod", "--frozen-lockfile"], cwd)
}

async function bundleEntry(entry: string, cloneDir: string) {
  const bundleDir = path.join(cloneDir, ".adamantite-build")

  await build({
    clean: true,
    config: false,
    cwd: cloneDir,
    deps: {
      alwaysBundle: [/.*/],
      onlyImport: [],
    },
    dts: false,
    entry: [entry],
    format: "esm",
    logLevel: "silent",
    outDir: bundleDir,
    outExtensions: () => ({ js: ".mjs" }),
    platform: "node",
  })

  const entryName = `${path.basename(entry, path.extname(entry))}.mjs`
  return readFile(path.join(bundleDir, entryName), "utf8")
}

async function bundlePlugin(plugin: VendoredPlugin, cloneDir: string) {
  if (plugin.exportName === undefined) {
    return bundleEntry(plugin.entry, cloneDir)
  }

  // Oxlint loads the default export of a plugin module, so re-export the named one as default.
  const wrapperEntry = "adamantite-entry.ts"
  const entrySpecifier = `./${plugin.entry.replace(/\.ts$/, "")}`
  await writeFile(
    path.join(cloneDir, wrapperEntry),
    `export { ${plugin.exportName} as default } from ${JSON.stringify(entrySpecifier)}\n`
  )

  return bundleEntry(wrapperEntry, cloneDir)
}

async function vendorPlugin(plugin: VendoredPlugin) {
  const outDir = path.join(import.meta.dirname, "..", plugin.outDir)
  const cloneDir = await mkdtemp(path.join(tmpdir(), `${plugin.name}-`))

  try {
    await run("git", ["clone", plugin.repoUrl, "."], cloneDir)
    await run("git", ["checkout", plugin.pinnedRef], cloneDir)
    const { stdout: revParse } = await run("git", ["rev-parse", "HEAD"], cloneDir)
    const commit = revParse.trim()

    // Install the plugin's dependencies so the bundler can inline them.
    await installUpstreamDependencies(cloneDir)

    // Strip temporary clone paths from module comments so re-vendoring produces stable diffs.
    const cloneDirPattern = new RegExp(`^// \\S*${path.basename(cloneDir)}/`, "gmu")
    const source = plugin.repoUrl.replace(/\.git$/, "")
    const bannerFor = (subject: string) => `// Vendored build of the ${subject}.
// Source: ${source} (MIT) at commit ${commit}.
// Its dependencies (MIT) are inlined so this file is self-contained.
// See license.md for the full license text.
//
// Generated by scripts/vendor-plugins.ts — do not edit by hand.
`
    const rawBundle = await bundlePlugin(plugin, cloneDir)
    const bundle = rawBundle.replace(cloneDirPattern, "// ")
    const banner = bannerFor(`${plugin.name} oxlint plugin`)
    const companions: Array<{ readonly content: string; readonly fileName: string }> = []

    // Bundle one at a time: every build cleans and reuses the same output directory.
    for (const companion of plugin.companionFiles ?? []) {
      // oxlint-disable-next-line no-await-in-loop
      const rawCompanion = await bundleEntry(companion.entry, cloneDir)

      companions.push({
        content:
          bannerFor(`${companion.fileName} companion of the ${plugin.name} oxlint plugin`)
          + rawCompanion.replace(cloneDirPattern, "// "),
        fileName: companion.fileName,
      })
    }

    const upstreamLicense = await readFile(path.join(cloneDir, "LICENSE"), "utf8")
    const license = `# ${plugin.name} license

The bundled \`plugin.mjs\` is a build of
[${plugin.name}](${source}) at commit ${commit},
with its dependencies (MIT) inlined.

${upstreamLicense}`
    const declaration = `// Generated by scripts/vendor-plugins.ts — do not edit by hand.
interface VendoredPluginRule {
  readonly create: (context: never) => Record<string, never>
}

declare const vendoredPlugin: {
  readonly meta: { readonly name: string }
  readonly rules: { readonly [ruleName: string]: VendoredPluginRule }
}

export default vendoredPlugin
`

    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, "plugin.mjs"), banner + bundle)
    await writeFile(path.join(outDir, "plugin.d.mts"), declaration)
    await writeFile(path.join(outDir, "license.md"), license)
    await Promise.all(
      companions.map((companion) =>
        writeFile(path.join(outDir, companion.fileName), companion.content)
      )
    )
    console.info(`Vendored ${plugin.name}@${commit} to ${outDir}`)
  } finally {
    // Keep a cleanup failure from masking the clone, install, or bundle error.
    await rm(cloneDir, { force: true, recursive: true }).catch(() => null)
  }
}

const selectedName = process.argv[2]
const plugins = selectedName
  ? VENDORED_PLUGINS.filter((plugin) => plugin.name === selectedName)
  : VENDORED_PLUGINS

if (plugins.length === 0) {
  throw new Error(`No vendored plugin named ${selectedName}`)
}

await Promise.all(plugins.map((plugin) => vendorPlugin(plugin)))
