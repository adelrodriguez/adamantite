import { readFileSync } from "node:fs"

export function getHardenPromptTemplate(): string {
  return readFileSync(new URL("harden-prompt.md", import.meta.url), "utf8")
}

export function getEnforcementLadder(): string {
  const reference = readFileSync(
    new URL(
      "../../../skills/adamantite-hardening/references/enforcement-ladder.md",
      import.meta.url
    ),
    "utf8"
  )

  return reference.slice(reference.indexOf("\n") + 1).trim()
}
