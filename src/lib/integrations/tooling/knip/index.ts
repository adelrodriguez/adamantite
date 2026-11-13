import { defineConfigTooling } from "#lib/integrations/tooling/base.ts"
import * as commands from "#lib/integrations/tooling/knip/command.ts"
import {
  inspectRequiredKnipConfig,
  toKnipTsConfigContent,
  toKnipWorkspace,
} from "#lib/integrations/tooling/knip/config.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { getScriptsThatRun } from "#lib/workspace/package-json.ts"

export default {
  analyze: commands.analyze,
  ...defineConfigTooling({
    configContent: toKnipTsConfigContent,
    configFiles: {
      config: "knip.config.ts",
      legacyConfigs: ["knip.json", "knip.jsonc"],
    },
    inspectConfig: inspectRequiredKnipConfig,
    name: "knip",
    purpose: "the managed `analyze` script",
    scripts: getScriptsThatRun("knip"),
    version: getDependencyVersion("knip"),
    workspace: toKnipWorkspace,
  }),
}
