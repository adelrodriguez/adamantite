import { inspectRequiredPresetConfig } from "#lib/workspace/tooling/preset-config.ts"

export function inspectRequiredOxfmtConfig(content: string) {
  return inspectRequiredPresetConfig(content, {
    moduleName: "adamantite/format",
    presetName: "Adamantite format",
  })
}

export function toOxfmtTsConfigContent() {
  return [
    'import { defineConfig } from "oxfmt"',
    'import format from "adamantite/format"',
    "",
    "export default defineConfig(format)",
    "",
  ].join("\n")
}
