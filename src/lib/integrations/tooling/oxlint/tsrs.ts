import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

// Oxlint ran its type-aware rules on oxlint-tsgolint before tsrs replaced it.
const RETIRED_BACKEND = "oxlint-tsgolint"

export default definePackageTooling({
  legacyFindings: (packageJson) =>
    (packageJson.devDependencies?.[RETIRED_BACKEND] ?? packageJson.dependencies?.[RETIRED_BACKEND])
      ? [
          {
            currentState: `\`package.json\` lists \`${RETIRED_BACKEND}\`, which Adamantite no longer uses.`,
            goal: [`Remove \`${RETIRED_BACKEND}\` from \`package.json\`, and install again.`],
            id: `legacy-${RETIRED_BACKEND}`,
            integration: "tsrs",
            notes: [
              "Adamantite runs the type-aware rules on tsrs, so Oxlint does not start oxlint-tsgolint.",
            ],
            title: `Legacy ${RETIRED_BACKEND}`,
          },
        ]
      : [],
  name: "tsrs",
  purpose: "the type-aware rules of the managed lint scripts",
  scripts: ["check", "fix"],
  version: getDependencyVersion("tsrs"),
})
