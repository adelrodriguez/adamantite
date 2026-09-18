import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { defineConfigTooling } from "#lib/workspace/tooling/config.ts"
import { inspectRequiredOxfmtConfig, toOxfmtTsConfigContent } from "#lib/workspace/tooling/oxfmt.ts"

export default defineConfigTooling({
  configContent: toOxfmtTsConfigContent,
  configFiles: {
    config: "oxfmt.config.ts",
    legacyConfigs: [".oxfmtrc.json", ".oxfmtrc.jsonc"],
  },
  inspectConfig: inspectRequiredOxfmtConfig,
  legacyFindings: (packageJson) =>
    packageJson.scripts?.format === "adamantite format"
      ? [
          {
            currentState: "The legacy managed `format` script is present in `package.json`.",
            goal: ["Remove the `format` script from `package.json`."],
            id: "legacy-format-script",
            integration: "oxfmt",
            notes: [
              "The managed `check` script verifies formatting and the managed `fix` script applies it.",
              "Doctor does not assess `AGENTS.md`. Remove the `format` line from its Adamantite section.",
            ],
            title: "Legacy format script",
          },
        ]
      : [],
  name: "oxfmt",
  purpose: "the managed `check` and `fix` scripts",
  scripts: ["check", "fix"],
  version: getDependencyVersion("oxfmt"),
})
