/**
 * Builds the package with Bun's native bundler.
 *
 * Two stages: the CLI bundles src/index.ts (Bun macros run here) with runtime dependencies left
 * external, and the presets compile file-per-file with declarations emitted through oxc-transform's
 * isolated declarations — the build fails loudly on every declaration diagnostic instead of
 * widening types silently.
 */
import { rm } from "node:fs/promises"
import path from "node:path"
import { type BunPlugin, Glob } from "bun"
import { isolatedDeclarationSync } from "oxc-transform"

const root = path.join(import.meta.dirname, "..")
const presetEntries = [...new Glob("presets/**/*.ts").scanSync(root)]

// `packages: "external"` keeps runtime dependencies out of the bundle (and lets Bun macros
// evaluate, which explicit external lists break), but it also externalizes `#` subpath
// imports — those resolve to src/, which is not published, so bundle them explicitly.
const resolveSubpathImports: BunPlugin = {
  name: "resolve-subpath-imports",
  setup(build) {
    build.onResolve({ filter: /^#/ }, (args) => ({ path: Bun.resolveSync(args.path, root) }))
  },
}

await rm(path.join(root, "dist"), { force: true, recursive: true })

// The presets need no external list: every preset import is type-only, so the bundler erases
// them all before resolution and the compiled presets have zero imports.
const [cli, presets] = await Promise.all([
  Bun.build({
    entrypoints: [path.join(root, "src/index.ts")],
    minify: true,
    outdir: path.join(root, "dist"),
    packages: "external",
    plugins: [resolveSubpathImports],
    target: "node",
  }),
  Bun.build({
    entrypoints: presetEntries.map((entry) => path.join(root, entry)),
    outdir: path.join(root, "dist/presets"),
    root: path.join(root, "presets"),
    target: "node",
  }),
])

if (!(cli.success && presets.success)) {
  const messages = [...cli.logs, ...presets.logs].map((log) => log.message)
  throw new Error(`Build failed:\n${messages.join("\n")}`)
}

const declarations = await Promise.allSettled(
  presetEntries.map(async (entry) => {
    const source = await Bun.file(path.join(root, entry)).text()
    const { code, errors } = isolatedDeclarationSync(entry, source)

    if (errors.length > 0) {
      throw new Error(errors.map((error) => `${entry}: ${error.message}`).join("\n"))
    }

    const outPath = path
      .join(root, "dist/presets", path.relative("presets", entry))
      .replace(/\.ts$/, ".d.ts")
    await Bun.write(outPath, code)
  })
)
const declarationFailures = declarations.filter(
  (result): result is PromiseRejectedResult => result.status === "rejected"
)

if (declarationFailures.length > 0) {
  const reasons = declarationFailures.map((failure) => String(failure.reason))
  throw new Error(`Declaration emit failed:\n${reasons.join("\n")}`)
}

await Promise.all(
  ["tsconfig.json", "lint/antislop/plugin.mjs", "lint/antislop/license.md"].map((file) =>
    Bun.write(path.join(root, "dist/presets", file), Bun.file(path.join(root, "presets", file)))
  )
)

console.info(`Built CLI and ${presetEntries.length} presets to dist/`)
