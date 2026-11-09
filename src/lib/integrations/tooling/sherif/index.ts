import type { CommandRunOptions } from "#lib/execution/command-runner.ts"
import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import { getLegacyMonorepoScriptFindings } from "#lib/integrations/tooling/sherif/legacy-scripts.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { getScriptsThatRun } from "#lib/workspace/package-json.ts"

function analyze(options: {
  readonly cwd: string
  readonly fix: boolean
  readonly forwardedArguments: readonly string[]
}): CommandRunOptions {
  return {
    args: [...(options.fix ? ["--fix"] : []), ...options.forwardedArguments],
    command: "sherif",
    cwd: options.cwd,
    // Sherif prompts for a version when a fix has more than one candidate.
    stdin: "inherit",
    title: "📦 Analyzing the monorepo",
  }
}

export default {
  analyze,
  ...definePackageTooling({
    legacyFindings: getLegacyMonorepoScriptFindings,
    monorepoOnly: true,
    name: "sherif",
    purpose: "the managed `analyze` script in a monorepo",
    scripts: getScriptsThatRun("sherif"),
    version: getDependencyVersion("sherif"),
  }),
}
