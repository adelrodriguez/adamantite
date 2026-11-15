import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as String from "effect/String"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import { getShippedSkillFiles } from "#lib/execution/skill.macro.ts" with { type: "macro" }
import { detectSkillFolders } from "#lib/execution/skill.ts"
import {
  ADAMANTITE_AGENTS_END_MARKER,
  ADAMANTITE_AGENTS_START_MARKER,
  renderAgentsSection,
} from "#lib/integrations/agents/section.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

const AGENTS_PATH = "AGENTS.md"

/**
 * The skill that this Adamantite build ships, keyed by POSIX paths relative to the skill folder.
 */
const shippedSkill = getShippedSkillFiles()

/**
 * The Adamantite section of `AGENTS.md` for the selection, with the commands of the project's
 * package manager. None when Adamantite cannot detect the package manager.
 */
const readAgentsSection = Effect.fn("readAgentsSection")(function* (
  { cwd, workspace }: Project,
  { scripts }: Selection
) {
  const detected = yield* (yield* DependencyInstaller).detectPackageManager(cwd)

  return Option.map(Option.fromNullishOr(detected), ({ name }) =>
    renderAgentsSection({ isMonorepo: workspace.isMonorepo, packageManager: name, scripts })
  )
})

/**
 * The findings for `AGENTS.md`: a missing file, and a file without the Adamantite section.
 * Adamantite writes `AGENTS.md` only when it does not exist, and never adds the section to a file
 * that the project wrote. In a monorepo, Doctor checks only the root.
 */
const assess = Effect.fn("assess")(function* (cwd: string) {
  const path = yield* Path.Path
  const content = yield* readFileIfExists(path.join(cwd, AGENTS_PATH))

  if (Option.isNone(content)) {
    return [
      {
        currentState: "The project root has no `AGENTS.md`.",
        goal: [
          `Run \`adamantite update\`. It writes \`${AGENTS_PATH}\` with the Adamantite section.`,
          "Run `adamantite doctor` again. It must not report this finding.",
        ],
        id: "missing-agents-md",
        integration: "agents",
        notes: [
          "`AGENTS.md` is where coding agents start. It points to the other documentation of the project.",
        ],
        title: "Missing AGENTS.md",
      } satisfies Finding,
    ]
  }

  if (String.includes(ADAMANTITE_AGENTS_START_MARKER)(content.value)) {
    return []
  }

  return [
    {
      currentState: `\`${AGENTS_PATH}\` has no Adamantite section, so coding agents do not learn the Adamantite skill and commands.`,
      goal: [
        `Add a section between \`${ADAMANTITE_AGENTS_START_MARKER}\` and \`${ADAMANTITE_AGENTS_END_MARKER}\` to \`${AGENTS_PATH}\`. It tells coding agents to use the Adamantite skill, to run the managed scripts, and to run \`adamantite doctor\` for setup findings. Keep the rest of the file.`,
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "missing-agents-section",
      integration: "agents",
      title: "AGENTS.md has no Adamantite section",
    } satisfies Finding,
  ]
})

/**
 * The findings for each copy of the Adamantite skill that differs from the skill of this version,
 * in the skill folders of the agents that the project uses. An earlier version wrote the copy
 * before the lockfile recorded it, or the project changed it, so `update` keeps it.
 */
const assessSkill = Effect.fn("assessSkill")(function* (cwd: string) {
  const path = yield* Path.Path
  const folders = yield* detectSkillFolders(cwd)

  const stale = yield* Effect.filter(
    folders,
    (folder) =>
      Effect.gen(function* () {
        const copy = yield* Effect.forEach(
          Object.entries(shippedSkill),
          ([file, content]) =>
            Effect.map(readFileIfExists(path.join(cwd, folder, "adamantite", file)), (current) =>
              Option.contains(current, content)
            ),
          { concurrency: "unbounded" }
        )

        const exists = yield* readFileIfExists(path.join(cwd, folder, "adamantite", "SKILL.md"))

        return Option.isSome(exists) && copy.includes(false)
      }),
    { concurrency: "unbounded" }
  )

  return stale.map((folder): Finding => ({
    currentState: `\`${folder}/adamantite\` differs from the Adamantite skill of the installed version.`,
    goal: [
      `Delete \`${folder}/adamantite\`, then run \`adamantite update\`. It writes the skill of the installed version.`,
      "Run `adamantite doctor` again. It must not report this finding.",
    ],
    id: "stale-adamantite-skill",
    integration: "agents",
    notes: ["Keep the changes that the project made to the skill only when they are still needed."],
    title: "Stale Adamantite skill",
  }))
})

export default {
  assess: ({ cwd }: Project, _selection: Selection) =>
    Effect.map(
      Effect.all([assess(cwd), assessSkill(cwd)], { concurrency: "unbounded" }),
      ([agents, skill]) => ({
        findings: [...agents, ...skill],
        packageActions: [],
        warnings: [],
      })
    ),
  // The skill goes to each skill folder of the agents that the project uses.
  files: (project: Project, selection: Selection) =>
    Effect.gen(function* () {
      const folders = yield* detectSkillFolders(project.cwd)
      const section = yield* readAgentsSection(project, selection)

      return [
        ...Option.match(section, {
          onNone: () => [],
          onSome: (content) => [{ content, path: AGENTS_PATH }],
        }),
        ...folders.flatMap((folder) =>
          Object.entries(shippedSkill).map(([file, content]) => ({
            content,
            path: `${folder}/adamantite/${file}`,
          }))
        ),
      ]
    }),
  name: "agents",
  packages: (_project: Project, _selection: Selection) => [],
  prepare: (_project: Project) => Effect.void,
  selected: ({ agents }: Selection) => agents,
} satisfies Integration
