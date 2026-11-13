import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Finding } from "#lib/integrations/base.ts"
import type { Project } from "#lib/workspace/project.ts"
import { resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"

const COMPILER = "@astrojs/compiler-rs"

/**
 * The finding for an Astro project whose Oxfmt cannot load the Astro compiler. Oxfmt imports the
 * compiler from its own package folder when it formats an `.astro` file, so the check resolves it
 * from there. Astro 7 and later depend on the compiler. Package assessment reports a missing Oxfmt,
 * so this check skips it.
 */
export const assessAstroCompiler = Effect.fn("assessAstroCompiler")(function* ({
  cwd,
  packageJson,
}: Project) {
  const astro = packageJson.devDependencies?.["astro"] ?? packageJson.dependencies?.["astro"]
  const oxfmt = yield* resolvePackageDirectory(cwd, "oxfmt")

  if (astro === undefined || Option.isNone(oxfmt)) {
    return [] satisfies readonly Finding[]
  }

  if (Option.isSome(yield* resolvePackageDirectory(oxfmt.value, COMPILER))) {
    return [] satisfies readonly Finding[]
  }

  return [
    {
      currentState: `\`package.json\` declares \`astro\` as \`${astro}\`, but Oxfmt cannot load \`${COMPILER}\`, so it fails on each \`.astro\` file.`,
      goal: [
        "Update `astro` to 7.0.0 or later, which depends on `@astrojs/compiler-rs`, and install the dependencies.",
        "If the package manager does not make dependencies of dependencies available to Oxfmt, add `@astrojs/compiler-rs` as a devDependency.",
      ],
      id: "unavailable-astro-compiler",
      integration: "oxfmt",
      notes: [
        "Adamantite formats Astro files with Oxfmt only for Astro 7 and later.",
        "Verification: run `adamantite check --only format` after the repair.",
      ],
      title: "Oxfmt cannot format Astro files",
    },
  ] satisfies readonly Finding[]
})
