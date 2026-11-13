/**
 * Re-vendors third-party oxlint plugins into the presets that ship them.
 *
 * Some plugins are not published to npm, so Adamantite ships a bundled build that inlines the
 * plugin's dependencies. The upstream lockfile pins those dependency versions. If an upstream drops
 * its lockfile, a re-vendor at the same ref can inline different versions.
 *
 * Usage: node scripts/vendor-plugins.ts [name]
 *
 * After you change a pinned ref, review the upstream diff and update the rules in the owning
 * preset. The preset's drift test reports a mismatch. Also check each patch of the plugin in
 * scripts/vendor-patches/<name>/. Delete a patch that upstream has applied, and refresh a patch
 * that no longer applies.
 */
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { build } from "tsdown"

const execFileAsync = promisify(execFile)
const maxCommandOutputBytes = 10 * 1024 * 1024

const UpstreamPackageJson = Schema.Struct({ packageManager: Schema.String })
const decodeUpstreamPackageJson = Schema.decodeUnknownSync(UpstreamPackageJson)

const BundledPluginModule = Schema.Struct({
  default: Schema.Struct({ rules: Schema.Record(Schema.String, Schema.Unknown) }),
})

const decodeBundledPluginModule = Schema.decodeUnknownSync(BundledPluginModule)

interface VendoredPlugin {
  /**
   * Bundle entry point, relative to the upstream repository root.
   */
  readonly entry: string
  /**
   * License files of third-party code that upstream copied into its own source, relative to the
   * upstream repository root. The bundle inlines that code, so license.md must keep its notices.
   */
  readonly copiedLicenses: readonly string[]
  readonly name: string
  /**
   * Output directory, relative to this repository's root.
   */
  readonly outDir: string
  /**
   * Fixes that Adamantite applies to the upstream source before the build, as `git apply` patch
   * files in scripts/vendor-patches/<name>/. Each patch states the defect that it fixes.
   */
  readonly patches: readonly string[]
  readonly pinnedRef: string
  readonly repoUrl: string
}

const VENDORED_PLUGINS: VendoredPlugin[] = [
  {
    copiedLicenses: [],
    entry: "src/effect/index.ts",
    name: "anti-slop-effect",
    outDir: "presets/lint/vendor/antislop-effect",
    // no-manual-tagged-construction reports Effect's own constructors that take `_tag` as input,
    // such as `PlatformError.systemError({ _tag: "NotFound", ... })`.
    patches: ["no-manual-tagged-construction-constructor-input.patch"],
    pinnedRef: "13909c9e07590f5a85d93c62712259fe14a883f7",
    repoUrl: "https://github.com/dmmulroy/anti-slop.git",
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

async function bundlePlugin(plugin: VendoredPlugin, cloneDir: string) {
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
    entry: [plugin.entry],
    format: "esm",
    logLevel: "silent",
    outDir: bundleDir,
    outExtensions: () => ({ js: ".mjs" }),
    platform: "node",
  })

  const entryName = `${path.basename(plugin.entry, path.extname(plugin.entry))}.mjs`

  return readFile(path.join(bundleDir, entryName), "utf8")
}

async function vendorPlugin(plugin: VendoredPlugin) {
  const outDir = path.join(import.meta.dirname, "..", plugin.outDir)
  const cloneDir = await mkdtemp(path.join(tmpdir(), `${plugin.name}-`))

  try {
    await run("git", ["clone", plugin.repoUrl, "."], cloneDir)
    await run("git", ["checkout", plugin.pinnedRef], cloneDir)
    const { stdout: revParse } = await run("git", ["rev-parse", "HEAD"], cloneDir)
    const commit = revParse.trim()

    // `git apply` applies all patches or none, and fails when a patch no longer applies.
    if (plugin.patches.length > 0) {
      const patchPaths = plugin.patches.map((patch) =>
        path.join(import.meta.dirname, "vendor-patches", plugin.name, patch)
      )

      await run("git", ["apply", ...patchPaths], cloneDir)
    }

    await installUpstreamDependencies(cloneDir)

    // Strip temporary clone paths from the `//#region` module comments, so re-vendoring produces
    // stable diffs. Tsdown writes those paths relative to the working directory of this script.
    const cloneDirPattern = new RegExp(`^//#region \\S*${path.basename(cloneDir)}/`, "gmu")
    const rawBundle = await bundlePlugin(plugin, cloneDir)
    const bundle = rawBundle.replaceAll(cloneDirPattern, "//#region ")

    const patchNotes = plugin.patches
      .map((patch) => `// Patched with scripts/vendor-patches/${plugin.name}/${patch}.\n`)
      .join("")

    const banner = `// Vendored build of the ${plugin.name} oxlint plugin.
// Source: ${plugin.repoUrl.replace(/\.git$/, "")} (MIT) at commit ${commit}.
// Its dependencies (MIT) are inlined so this file is self-contained.
// See license.md for the full license text.
${patchNotes}//
// Generated by scripts/vendor-plugins.ts — do not edit by hand.
`

    const upstreamLicense = await readFile(path.join(cloneDir, "LICENSE"), "utf8")

    const copiedLicenses = await Promise.all(
      plugin.copiedLicenses.map(
        async (file) => `## ${file}\n\n${await readFile(path.join(cloneDir, file), "utf8")}`
      )
    )

    const license = [
      `# ${plugin.name} license

The bundled \`plugin.mjs\` is a build of
[${plugin.name}](${plugin.repoUrl.replace(/\.git$/, "")}) at commit ${commit},
with its dependencies (MIT) inlined.

${upstreamLicense}`,
      ...copiedLicenses,
    ].join("\n")

    await mkdir(outDir, { recursive: true })
    const bundlePath = path.join(outDir, "plugin.mjs")
    await writeFile(bundlePath, banner + bundle)

    // Declare the rule names the bundle defines, so tests can address a rule without an index
    // lookup. `create` takes an `object` context so the opaque rule type stays assignable to the
    // rule type that RuleTester runs.
    const bundled = decodeBundledPluginModule(await import(pathToFileURL(bundlePath).href))

    const ruleDeclarations = EffectArray.sort(Object.keys(bundled.default.rules), Order.String)
      .map((ruleName) => `    readonly ${JSON.stringify(ruleName)}: VendoredPluginRule`)
      .join("\n")

    const declaration = `// Generated by scripts/vendor-plugins.ts — do not edit by hand.
interface VendoredPluginRule {
  readonly create: (context: object) => Record<string, never>
}

declare const vendoredPlugin: {
  readonly meta: { readonly name: string }
  readonly rules: {
${ruleDeclarations}
  }
}

export default vendoredPlugin
`

    await writeFile(path.join(outDir, "plugin.d.mts"), declaration)
    await writeFile(path.join(outDir, "license.md"), license)
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
