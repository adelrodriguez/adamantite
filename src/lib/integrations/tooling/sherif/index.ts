import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import * as commands from "#lib/integrations/tooling/sherif/command.ts"
import { getScriptsThatRun } from "#lib/project/package-json.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export default {
  analyze: commands.analyze,
  ...definePackageTooling({
    monorepoOnly: true,
    name: "sherif",
    purpose: "the managed `analyze` script in a monorepo",
    scripts: getScriptsThatRun("sherif"),
    version: getDependencyVersion("sherif"),
  }),
}
