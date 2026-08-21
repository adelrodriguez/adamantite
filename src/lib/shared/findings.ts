import type { Finding } from "#lib/integrations/base.ts"

export function collectFindings(
  assessments: ReadonlyArray<{ readonly assessment: { readonly findings: readonly Finding[] } }>
): Finding[] {
  return assessments.flatMap(({ assessment }) => assessment.findings)
}

export function renderFindingsPrompt(
  findings: readonly Finding[],
  adamantiteVersion: string
): string {
  const sections = findings.map((finding, index) => {
    const goal = finding.goal.map((item) => `  - ${item}`).join("\n")
    const reference = finding.reference
      ? `\n- **Reference:**\n\n\`\`\`ts\n${finding.reference.trimEnd()}\n\`\`\``
      : ""
    const notes = finding.notes
      ? `\n- **Notes:**\n${finding.notes.map((note) => `  - ${note}`).join("\n")}`
      : ""

    return `## ${index + 1}. ${finding.title}\n\n- **Current state:** ${finding.currentState}\n- **Goal:**\n${goal}${reference}${notes}`
  })

  return [
    "# Adamantite doctor findings",
    "",
    `This project uses Adamantite ${adamantiteVersion} to manage linting, formatting, and type tooling.`,
    `\`adamantite doctor\` found ${findings.length} issue(s). Fix them so that \`adamantite doctor\` exits 0.`,
    "Before editing, make sure the working tree is clean or the user has accepted the risk.",
    "",
    sections.join("\n\n"),
    "",
    "## Verify",
    "",
    "Run `adamantite doctor`. All findings above must be gone and it must exit 0.",
    "Do not suppress or work around checks; fix the underlying state.",
    "",
  ].join("\n")
}
