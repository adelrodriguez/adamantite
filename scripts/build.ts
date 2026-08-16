/**
 * Builds the package with Bun's native bundler.
 *
 * Two stages: the CLI bundles src/index.ts (Bun macros run here) with runtime dependencies left
 * external, and the presets compile file-per-file with declarations emitted through oxc-transform's
 * isolated declarations — the build fails loudly on any declaration diagnostic instead of widening
 * types silently.
 */
import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { type BunPlugin, Glob } from "bun"
import { isolatedDeclarationSync } from "oxc-transform"

const root = path.join(import.meta.dirname, "..")

// `packages: "external"` keeps runtime dependencies out of the bundle (and lets Bun macros
// evaluate, which explicit external lists break), but it also externalizes `#` subpath
// imports — those resolve to src/, which is not published, so bundle them explicitly.
const resolveSubpathImports: BunPlugin = {
  name: "resolve-subpath-imports",
  setup(build) {
    build.onResolve({ filter: /^#/ }, (args) => ({
      path: Bun.resolveSync(args.path, root),
    }))
  },
}
const presetEntries = [...new Glob("presets/**/*.ts").scanSync(root)]
function reportBuildFailure(stage: string, logs: Array<BuildMessage | ResolveMessage>): never {
  throw new Error(`${stage} build failed:\n${logs.map((log) => log.message).join("\n")}`)
}

function emitDeclaration(entry: string, source: string) {
  const declaration = isolatedDeclarationSync(entry, source)

  if (declaration.errors.length > 0) {
    const details = declaration.errors.map((error) => `${entry}: ${error.message}`).join("\n")
    throw new Error(`Declaration emit failed:\n${details}`)
  }

  const outPath = path
    .join(root, "dist/presets", path.relative("presets", entry))
    .replace(/\.ts$/, ".d.ts")
  return Bun.write(outPath, declaration.code)
}

await rm(path.join(root, "dist"), { force: true, recursive: true })

const cli = await Bun.build({
  entrypoints: [path.join(root, "src/index.ts")],
  minify: true,
  outdir: path.join(root, "dist"),
  packages: "external",
  plugins: [resolveSubpathImports],
  target: "node",
})

if (!cli.success) {
  reportBuildFailure("CLI", cli.logs)
}

// No external list: every preset import is type-only, so the bundler erases
// them all before resolution and the compiled presets have zero imports.
const presets = await Bun.build({
  entrypoints: presetEntries.map((entry) => path.join(root, entry)),
  outdir: path.join(root, "dist/presets"),
  root: path.join(root, "presets"),
  target: "node",
})

if (!presets.success) {
  reportBuildFailure("Presets", presets.logs)
}

const declarationResults = await Promise.allSettled(
  presetEntries.map(async (entry) => {
    const source = await Bun.file(path.join(root, entry)).text()
    return emitDeclaration(entry, source)
  })
)
const declarationFailures = declarationResults
  .filter((result): result is PromiseRejectedResult => result.status === "rejected")
  .map((result) => String(result.reason))

if (declarationFailures.length > 0) {
  throw new Error(declarationFailures.join("\n"))
}

await cp(path.join(root, "presets/tsconfig.json"), path.join(root, "dist/presets/tsconfig.json"))
await mkdir(path.join(root, "dist/presets/lint/antislop"), { recursive: true })
await Promise.all(
  ["plugin.mjs", "license.md"].map((file) =>
    cp(
      path.join(root, "presets/lint/antislop", file),
      path.join(root, "dist/presets/lint/antislop", file)
    )
  )
)

console.info(`Built CLI and ${presetEntries.length} presets to dist/`)
