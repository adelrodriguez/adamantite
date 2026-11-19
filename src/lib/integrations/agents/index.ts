import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Jsonc from "effect/encoding/Jsonc"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as String from "effect/String"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import type { Selection } from "#lib/project/selection.ts"
import {
  ADAMANTITE_AGENTS_END_MARKER,
  ADAMANTITE_AGENTS_START_MARKER,
  renderAgentsSection,
} from "#lib/integrations/agents/section.ts"
import { getShippedSkillFiles } from "#lib/integrations/agents/skill.macro.ts" with { type: "macro" }
import { detectSkillFolders } from "#lib/integrations/agents/skill.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import * as Project from "#lib/project/index.ts"
import { hashContent } from "#lib/project/lockfile.ts"
import { readDirectoryIfExists, readFileIfExists, readFileIfFile } from "#lib/shared/filesystem.ts"

const AGENTS_PATH = "AGENTS.md"

const shippedSkillFiles = getShippedSkillFiles()

const shippedSkills = Object.entries(
  Array.groupBy(Object.entries(shippedSkillFiles), ([file]) => file.slice(0, file.indexOf("/")))
).map(([name, files]) => ({
  files: files.map(([file, content]) => ({ content, file: file.slice(name.length + 1) })),
  name,
}))

const readAgentsSection = Effect.fn("readAgentsSection")(function* (
  { workspace }: Project.Snapshot,
  { scripts }: Selection
) {
  const cwd = yield* Project.Directory
  const detected = yield* (yield* DependencyInstaller).detectPackageManager(cwd)

  return Option.map(detected, ({ name }) =>
    renderAgentsSection({ isMonorepo: workspace.isMonorepo, packageManager: name, scripts })
  )
})

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
      currentState: `\`${AGENTS_PATH}\` has no Adamantite section, so coding agents do not learn the Adamantite skills and commands.`,
      goal: [
        `Add a section between \`${ADAMANTITE_AGENTS_START_MARKER}\` and \`${ADAMANTITE_AGENTS_END_MARKER}\` to \`${AGENTS_PATH}\`. It tells coding agents to use the Adamantite skills, to run the managed scripts, and to run \`adamantite doctor\` for setup findings. Keep the rest of the file.`,
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "missing-agents-section",
      integration: "agents",
      title: "AGENTS.md has no Adamantite section",
    } satisfies Finding,
  ]
})

const readSkillFile = Effect.fn("readSkillFile")(function* (
  { lockfile }: Project.Snapshot,
  file: string,
  shipped: string
) {
  const cwd = yield* Project.Directory
  const path = yield* Path.Path
  const current = yield* readFileIfExists(path.join(cwd, file))

  if (Option.isNone(current)) {
    return "missing"
  }

  const recorded = Option.flatMapNullishOr(lockfile, ({ written }) => written[file])

  return current.value === shipped
    || (Option.isSome(recorded) && recorded.value === (yield* hashContent(current.value)))
    ? "current"
    : "changed"
})

const readKeptExtraFiles = Effect.fn("readKeptExtraFiles")(function* (
  { lockfile }: Project.Snapshot,
  copy: string,
  shipped: readonly string[]
) {
  const cwd = yield* Project.Directory
  const path = yield* Path.Path
  const entries = yield* readDirectoryIfExists(path.join(cwd, copy), { recursive: true })

  const extras = Option.getOrElse(entries, () => [])
    .map((entry) => entry.split(path.sep).join("/"))
    .filter((entry) => !shipped.some((file) => file === entry || file.startsWith(`${entry}/`)))

  return yield* Effect.filter(
    extras,
    Effect.fnUntraced(function* (entry) {
      const content = yield* readFileIfFile(path.join(cwd, copy, entry))

      const recorded = Option.flatMapNullishOr(
        lockfile,
        ({ written }) => written[`${copy}/${entry}`]
      )

      return (
        Option.isSome(content)
        && !(Option.isSome(recorded) && recorded.value === (yield* hashContent(content.value)))
      )
    }),
    { concurrency: "unbounded" }
  )
})

const assessSkill = Effect.fn("assessSkill")(function* (project: Project.Snapshot) {
  const folders = yield* detectSkillFolders(yield* Project.Directory)

  const copies = yield* Effect.forEach(
    folders.flatMap((folder) =>
      shippedSkills.map((skill) => ({ copy: `${folder}/${skill.name}`, skill }))
    ),
    ({ copy, skill }) =>
      Effect.all(
        {
          copy: Effect.succeed(copy),
          extras: readKeptExtraFiles(
            project,
            copy,
            skill.files.map(({ file }) => file)
          ),
          files: Effect.forEach(
            skill.files,
            ({ content, file }) =>
              Effect.map(readSkillFile(project, `${copy}/${file}`, content), (state) => ({
                file,
                state,
              })),
            { concurrency: "unbounded" }
          ),
          name: Effect.succeed(skill.name),
        },
        { concurrency: "unbounded" }
      ),
    { concurrency: "unbounded" }
  )

  return copies.flatMap(({ copy, extras, files, name }): Finding[] => {
    const missing = files
      .filter(({ state }) => state === "missing")
      .map(({ file }) => `\`${file}\``)

    return [
      ...(missing.length === 0
        ? []
        : [
            {
              currentState: `The selection includes agent guidance, and \`${copy}\` has no ${missing.join(", ")}.`,
              goal: [
                `Run \`adamantite update\`. It writes the missing files of the skill to \`${copy}\`.`,
                "Run `adamantite doctor` again. It must not report this finding.",
              ],
              id: "missing-adamantite-skill",
              integration: "agents",
              title: "Missing Adamantite skill",
            },
          ]),
      ...(extras.length > 0 || files.some(({ state }) => state === "changed")
        ? [
            {
              currentState: [
                `\`${copy}\` differs from the \`${name}\` skill of the installed Adamantite version.`,
                ...(extras.length === 0
                  ? []
                  : [
                      `It holds ${extras.map((file) => `\`${file}\``).join(", ")}, which that version does not ship.`,
                    ]),
              ].join(" "),
              goal: [
                `Delete \`${copy}\`, then run \`adamantite update\`. It writes the skill of the installed version.`,
                "Run `adamantite doctor` again. It must not report this finding.",
              ],
              id: "stale-adamantite-skill",
              integration: "agents",
              notes: [
                "Keep the changes that the project made to the skill only when they are still needed.",
              ],
              title: "Stale Adamantite skill",
            },
          ]
        : []),
    ]
  })
})

const SKILLS_LOCK_PATH = "skills-lock.json"

const SkillsLock = Schema.Struct({
  skills: Schema.Record(Schema.String, Schema.Unknown),
})

const assessSkillsLock = Effect.fn("assessSkillsLock")(function* (cwd: string) {
  const path = yield* Path.Path
  const content = yield* readFileIfExists(path.join(cwd, SKILLS_LOCK_PATH))

  const recorded = Option.match(content, {
    onNone: () => [],
    onSome: (text) =>
      Result.match(Jsonc.parse(text), {
        onFailure: () => [],
        onSuccess: (lock) =>
          Schema.is(SkillsLock)(lock)
            ? shippedSkills
                .map((skill) => skill.name)
                .filter((name) => Object.hasOwn(lock.skills, name))
            : [],
      }),
  })

  return recorded.map((name): Finding => ({
    currentState: `\`${SKILLS_LOCK_PATH}\` records the \`${name}\` skill, so \`npx skills update\` would write the skill folders that \`adamantite update\` writes.`,
    goal: [
      `Remove the \`${name}\` entry from \`skills\` in \`${SKILLS_LOCK_PATH}\`. Delete the file when that entry was its only one.`,
      "Run `adamantite doctor` again. It must not report this finding.",
    ],
    id: "skills-lock-adamantite-entry",
    integration: "agents",
    title: "The skills lock records an Adamantite skill",
  }))
})

export default {
  assess: (project: Project.Snapshot, _selection: Selection) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory

      const [agents, skill, lock] = yield* Effect.all(
        [assess(cwd), assessSkill(project), assessSkillsLock(cwd)],
        { concurrency: "unbounded" }
      )

      return { findings: [...agents, ...skill, ...lock], packageActions: [], warnings: [] }
    }),
  files: (project: Project.Snapshot, selection: Selection) =>
    Effect.gen(function* () {
      const folders = yield* detectSkillFolders(yield* Project.Directory)
      const section = yield* readAgentsSection(project, selection)

      return [
        ...Option.match(section, {
          onNone: () => [],
          onSome: (content) => [{ content, path: AGENTS_PATH }],
        }),
        ...folders.flatMap((folder) =>
          Object.entries(shippedSkillFiles).map(([file, content]) => ({
            content,
            path: `${folder}/${file}`,
          }))
        ),
      ]
    }),
  name: "agents",
  packages: (_project: Project.Snapshot, _selection: Selection) => [],
  selected: ({ agents }: Selection) => agents,
} satisfies Integration
