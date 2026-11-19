import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type {
  InvalidLockfile,
  SetupAhead,
  SetupOutdated,
  UnsupportedLockfile,
} from "#lib/shared/errors.ts"
import { getRepairPromptTemplate } from "#lib/assessment/repair-prompt.macro.ts" with { type: "macro" }
import { getWarningReportTemplate } from "#lib/assessment/warning-report.macro.ts" with { type: "macro" }
import { Finding, PackageAction } from "#lib/integrations/base.ts"
import { integrations } from "#lib/integrations/index.ts"
import oxlintCustom from "#lib/integrations/oxlint/custom.ts"
import { managedPlugins } from "#lib/integrations/oxlint/plugins/managed.ts"
import tsrs from "#lib/integrations/oxlint/tsrs.ts"
import * as Project from "#lib/project/index.ts"
import { LOCKFILE_PATH, verifyLockfileVersion } from "#lib/project/lockfile.ts"
import {
  MANAGED_SCRIPT_COMMANDS,
  readPackageJson,
  SCRIPT_ORDER,
} from "#lib/project/package-json.ts"
import { Selection } from "#lib/project/selection.ts"
import { fillTemplate } from "#lib/shared/template.ts"

const repairPromptTemplate = getRepairPromptTemplate()
const warningReportTemplate = getWarningReportTemplate()

const managedIntegrations = [oxlintCustom, ...managedPlugins, tsrs] as const

const lockfileMissing: ProjectAssessment = {
  applicableIntegrations: [],
  findings: [
    {
      currentState: `The project has no \`${LOCKFILE_PATH}\`, so Adamantite does not know what to check.`,
      goal: [
        `Run \`adamantite init\`. It sets up the project and writes \`${LOCKFILE_PATH}\`.`,
        `Commit \`${LOCKFILE_PATH}\`.`,
      ],
      id: "lockfile-missing",
      integration: "lockfile",
      notes: [
        "Adamantite versions before the lockfile did not write one. `init` keeps each file that differs from what it would write, and Doctor then reports the changes that break the setup.",
      ],
      title: "Missing Adamantite lockfile",
    },
  ],
  packageActions: [],
  selection: null,
  warnings: [],
}

function assessUnreadableLockfile(error: InvalidLockfile | UnsupportedLockfile): ProjectAssessment {
  const finding = Match.valueTags(error, {
    InvalidLockfile: ({ issue, path }): Finding => ({
      currentState: `\`${path}\` does not decode as an Adamantite lockfile. ${issue}`,
      goal: [
        `Make \`${path}\` decode again, for example by resolving a merge conflict. Preserve the recorded \`selection\` and the hashes in \`written\`.`,
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "invalid-lockfile",
      integration: "lockfile",
      notes: ["Doctor reports the other findings after the lockfile decodes."],
      title: "Invalid Adamantite lockfile",
    }),
    UnsupportedLockfile: ({ path, schemaVersion, version }): Finding => ({
      currentState: Option.match(version, {
        onNone: () =>
          `\`${path}\` has schema version ${JSON.stringify(schemaVersion)}, which a newer Adamantite version wrote.`,
        onSome: (writer) =>
          `\`${path}\` has schema version ${JSON.stringify(schemaVersion)}, which Adamantite ${writer} wrote.`,
      }),
      goal: [
        Option.match(version, {
          onNone: () =>
            "Update the project's `adamantite` dependency to the version that wrote the lockfile, or newer, and install it.",
          onSome: (writer) =>
            `Update the project's \`adamantite\` dependency to ${writer} or newer, and install it.`,
        }),
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "unsupported-lockfile",
      integration: "lockfile",
      notes: ["Doctor reports the other findings after the lockfile decodes."],
      title: "Unsupported Adamantite lockfile",
    }),
  })

  return {
    applicableIntegrations: [],
    findings: [finding],
    packageActions: [],
    selection: null,
    warnings: [],
  }
}

function assessSetupVersion(error: SetupAhead | SetupOutdated): Finding {
  return Match.valueTags(error, {
    SetupAhead: ({ installed, path, recorded }): Finding => ({
      currentState: `\`${path}\` records the setup of Adamantite ${recorded}, but the project installs the older Adamantite ${installed}.`,
      goal: [
        `Install the dependencies. If the project still declares an \`adamantite\` version older than ${recorded}, update the dependency to ${recorded} or newer, and install it.`,
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "setup-ahead",
      integration: "lockfile",
      notes: [
        `Do not run \`adamantite update\` with Adamantite ${installed}. It would bring the managed files back to that version.`,
      ],
      title: "Setup is newer than the installed Adamantite",
    }),
    SetupOutdated: ({ installed, path, recorded }): Finding => ({
      currentState: `\`${path}\` records the setup of Adamantite ${recorded}, but the project installs Adamantite ${installed}, so the managed packages, files, and skill can be out of date. \`adamantite check\` fails until the setup is updated.`,
      goal: [
        `Run the project's installed \`adamantite update\` through its package runner, such as \`npx\` or \`pnpm exec\`. It applies the setup of Adamantite ${installed} and records that version in \`${path}\`.`,
        "Commit the changes, then run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "setup-outdated",
      integration: "lockfile",
      notes: [
        "Run the update before the other repairs, because it can resolve other findings, such as package drift.",
      ],
      title: "Setup is outdated",
    }),
  })
}

const notInstalled: ProjectAssessment = {
  applicableIntegrations: [],
  findings: [
    {
      currentState:
        "The root `package.json` does not declare `adamantite`, so the project runs no installed Adamantite version.",
      goal: [
        "Add `adamantite` to the `devDependencies` of the root `package.json` with the project's package manager, and install it.",
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "adamantite-not-installed",
      integration: "adamantite",
      notes: ["Doctor reports the other findings after the project installs Adamantite."],
      title: "Adamantite is not installed",
    },
  ],
  packageActions: [],
  selection: null,
  warnings: [],
}

function assessScripts({ packageJson }: Project.Snapshot, { scripts }: Selection): Finding[] {
  return SCRIPT_ORDER.filter((script) => scripts.includes(script)).flatMap((script): Finding[] => {
    const command = packageJson.scripts?.[script]
    const managed = MANAGED_SCRIPT_COMMANDS[script]

    if (command === managed) {
      return []
    }

    return [
      command === undefined
        ? {
            currentState: `The selection includes the \`${script}\` script, and the root \`package.json\` has no \`${script}\` script.`,
            goal: [
              `Run \`adamantite update\`. It sets the \`${script}\` script to \`${managed}\`.`,
              "Run `adamantite doctor` again. It must not report this finding.",
            ],
            id: "missing-managed-script",
            integration: "scripts",
            title: "Missing managed script",
          }
        : {
            currentState: `The selection includes the \`${script}\` script, and the root \`package.json\` sets it to \`${command}\`, not to \`${managed}\`.`,
            goal: [
              `Run \`adamantite update\`. It sets the \`${script}\` script to \`${managed}\`, and replaces what the script ran.`,
              "Run `adamantite doctor` again. It must not report this finding.",
            ],
            id: "mismatched-managed-script",
            integration: "scripts",
            notes: [
              `If the project still needs \`${command}\`, move it to a script of another name before the update, and run that script wherever the project ran \`${script}\`, such as in CI.`,
            ],
            title: "Managed script runs another command",
          },
    ]
  })
}

export const ProjectAssessment = Schema.Struct({
  applicableIntegrations: Schema.Array(Schema.String),
  findings: Schema.Array(Finding),
  packageActions: Schema.Array(PackageAction),
  selection: Schema.NullOr(Selection),
  warnings: Schema.Array(Schema.String),
})

export type ProjectAssessment = typeof ProjectAssessment.Type

export const assessProject = Effect.fn("assessProject")(function* (project: Project.Snapshot) {
  if (Option.isNone(project.lockfile)) {
    return lockfileMissing
  }

  const { selection } = project.lockfile.value

  const setupVersion = yield* verifyLockfileVersion(
    yield* Project.Directory,
    project.lockfile
  ).pipe(
    Effect.as([]),
    Effect.catchTag(["SetupAhead", "SetupOutdated"], (error) =>
      Effect.succeed([assessSetupVersion(error)])
    )
  )

  const assessments = yield* Effect.forEach(
    managedIntegrations,
    (integration) =>
      Effect.gen(function* () {
        const assessment = yield* integration.assess(project)

        return assessment.applicable ? [{ assessment, name: integration.name }] : []
      }),
    // `Effect.forEach` keeps the results in input order.
    { concurrency: "unbounded" }
  )

  const parts = yield* Effect.forEach(
    integrations.filter((integration) => integration.selected(selection)),
    (integration) =>
      integration
        .assess(project, selection)
        .pipe(Effect.map((assessment) => ({ assessment, name: integration.name }))),
    { concurrency: "unbounded" }
  )

  const applicable = [...Array.flatten(assessments), ...parts]

  return {
    applicableIntegrations: applicable.map(({ name }) => name),
    findings: [
      ...setupVersion,
      ...assessScripts(project, selection),
      ...applicable.flatMap(({ assessment }) => assessment.findings),
    ],
    packageActions: applicable.flatMap(({ assessment }) => assessment.packageActions),
    selection,
    warnings: applicable.flatMap(({ assessment }) => assessment.warnings),
  } satisfies ProjectAssessment
})

export const readAssessment = Effect.fn("readAssessment")(function* () {
  const packageJson = yield* readPackageJson(yield* Project.Directory)

  if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
    return notInstalled
  }

  return yield* Project.read().pipe(
    Effect.flatMap(assessProject),
    Effect.catchTag(["InvalidLockfile", "UnsupportedLockfile"], (error) =>
      Effect.succeed(assessUnreadableLockfile(error))
    )
  )
})

export function renderAssessmentMarkdown(
  assessment: Pick<ProjectAssessment, "findings" | "warnings">,
  adamantiteVersion: string
): string {
  return assessment.findings.length === 0
    ? renderWarningReport(assessment.warnings, adamantiteVersion)
    : renderRepairPrompt(assessment.findings, assessment.warnings, adamantiteVersion)
}

function toWarningItem(warning: string): string {
  return `- ${warning.replaceAll("\n", "\n  ")}`
}

function renderWarningReport(warnings: readonly string[], adamantiteVersion: string): string {
  return fillTemplate(warningReportTemplate, {
    version: adamantiteVersion,
    warnings: warnings.map((warning) => toWarningItem(warning)).join("\n"),
  })
}

function renderRepairPrompt(
  findings: readonly Finding[],
  warnings: readonly string[],
  adamantiteVersion: string
): string {
  const sections = findings.map((finding, index) => {
    const goal = finding.goal.map((item) => `  - ${item}`).join("\n")

    const reference = finding.reference
      ? `\n- **Reference:**\n\n\`\`\`${finding.reference.language}\n${finding.reference.content.trimEnd()}\n\`\`\``
      : ""

    const notes =
      finding.notes && finding.notes.length > 0
        ? `\n- **Notes:**\n${finding.notes.map((note) => `  - ${note}`).join("\n")}`
        : ""

    return `## ${index + 1}. ${finding.title}\n\n- **Current state:** ${finding.currentState}\n- **Goal:**\n${goal}${reference}${notes}`
  })

  const warningSection =
    warnings.length > 0
      ? [
          "## Assessment warnings",
          "",
          "Review these warnings before making repairs:",
          "",
          ...warnings.map((warning) => toWarningItem(warning)),
          "",
          "",
        ].join("\n")
      : ""

  return fillTemplate(repairPromptTemplate, {
    findingCount: findings.length.toLocaleString("en-US"),
    findings: sections.join("\n\n"),
    version: adamantiteVersion,
    warnings: warningSection,
  })
}
