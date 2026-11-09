import type { Script } from "#lib/workspace/package-json.ts"

/**
 * The names of the `adamantite init` flags that a repair command uses. `commands/init/options.ts`
 * defines each flag with these names, so a finding cannot name a flag that init does not have.
 */
export const INIT_FLAGS = {
  agents: "agents",
  editor: "editor",
  nonInteractive: "non-interactive",
  preset: "preset",
  script: "script",
} as const

interface InitCommandSetup {
  readonly agents?: boolean
  readonly editors?: readonly string[]
  readonly presets?: readonly string[]
  readonly scripts: readonly Script[]
}

/**
 * The non-interactive `adamantite init` command that sets up `setup`, for a finding to show as its
 * repair.
 */
export function formatInitCommand({
  agents = false,
  editors = [],
  presets = [],
  scripts,
}: InitCommandSetup): string {
  return [
    "adamantite init",
    `--${INIT_FLAGS.nonInteractive}`,
    ...scripts.map((script) => `--${INIT_FLAGS.script} ${script}`),
    ...presets.map((preset) => `--${INIT_FLAGS.preset} ${preset}`),
    ...editors.map((editor) => `--${INIT_FLAGS.editor} ${editor}`),
    ...(agents ? [`--${INIT_FLAGS.agents}`] : []),
  ].join(" ")
}
