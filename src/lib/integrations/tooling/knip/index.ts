import type { CommandRunOptions } from "#lib/execution/command-runner.ts"
import { defineConfigTooling } from "#lib/integrations/tooling/base.ts"
import {
  inspectRequiredKnipConfig,
  toKnipTsConfigContent,
  toKnipWorkspace,
} from "#lib/integrations/tooling/knip/config.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { getScriptsThatRun } from "#lib/workspace/package-json.ts"

function analyze(options: {
  readonly cwd: string
  readonly fix: boolean
  readonly strict: boolean
  readonly forwardedArguments: readonly string[]
}): CommandRunOptions {
  return {
    args: [
      ...(options.fix ? ["--fix", "--allow-remove-files"] : []),
      ...(options.strict ? ["--production", "--strict"] : []),
      ...options.forwardedArguments,
    ],
    command: "knip",
    cwd: options.cwd,
    stdin: "ignore",
    title: "🧹 Analyzing unused code",
  }
}

export default {
  analyze,
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
