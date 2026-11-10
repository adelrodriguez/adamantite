import { defineConfigTooling } from "#lib/integrations/tooling/base.ts"
import * as commands from "#lib/integrations/tooling/oxfmt/command.ts"
import {
  inspectRequiredOxfmtConfig,
  toOxfmtTsConfigContent,
} from "#lib/integrations/tooling/oxfmt/config.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { getScriptsThatRun } from "#lib/workspace/package-json.ts"

export default {
  check: commands.check,
  fix: commands.fix,
  ...defineConfigTooling({
    configContent: toOxfmtTsConfigContent,
    configFiles: {
      config: "oxfmt.config.ts",
      legacyConfigs: [".oxfmtrc.json", ".oxfmtrc.jsonc"],
    },
    inspectConfig: inspectRequiredOxfmtConfig,
    name: "oxfmt",
    purpose: "the managed `check` and `fix` scripts",
    scripts: getScriptsThatRun("oxfmt"),
    version: getDependencyVersion("oxfmt"),
    workspace: ({ isMonorepo }) => ({ isMonorepo }),
  }),
}
