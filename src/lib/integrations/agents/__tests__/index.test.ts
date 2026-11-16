import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import {
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { runLifecycle } from "#__tests__/lifecycle.ts"
import { getShippedSkillFiles } from "#lib/integrations/agents/skill.macro.ts" with { type: "macro" }
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"

const AGENTS = "AGENTS.md"

const SKILL = ".agents/skills/adamantite/SKILL.md"

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const INIT_ARGS = ["--non-interactive", "--script", "check", "--agents"]

const shippedSkill = getShippedSkillFiles()

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { ...files, "package.json": PACKAGE_JSON } })
}

describe("agent guidance setup", () => {
  it.effect("create AGENTS.md and the skill, and record their hashes", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)
      const { written } = readLockfile(files)

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(files.read(AGENTS)).toContain("- Run `bun run check` to catch formatting")
      expect(files.read(SKILL)).toBe(shippedSkill["SKILL.md"])
      expect({ agents: written[AGENTS], skill: written[SKILL] }).toStrictEqual({
        agents: hashContent(files.read(AGENTS)),
        skill: hashContent(files.read(SKILL)),
      })
      expect(output).toContain(`✔ \`${AGENTS}\` created.`)
    })
  )

  it.effect("write the skill to the skill folder of each agent that the project uses", () =>
    Effect.gen(function* () {
      const files = makeProject({ ".claude/settings.json": "{}\n" })

      yield* runLifecycle("init", files, INIT_ARGS)

      expect(files.read(".claude/skills/adamantite/SKILL.md")).toBe(shippedSkill["SKILL.md"])
    })
  )

  // Adamantite writes AGENTS.md only when it does not exist, and never splices its section.
  it.effect("keep an AGENTS.md that the project wrote, and report the missing section", () =>
    Effect.gen(function* () {
      const own = "# Team instructions\n\nRun the tests before a commit.\n"
      const files = makeProject({ [AGENTS]: own })

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.read(AGENTS)).toBe(own)
      expect(init.output).toContain(`● \`${AGENTS}\` kept, because it has changes`)
      expect(doctor.output).toContain("AGENTS.md has no Adamantite section")
    })
  )

  // The skill copy of an earlier release has no recorded hash, so update keeps it.
  it.effect("keep a skill copy that differs from the shipped skill, and report it", () =>
    Effect.gen(function* () {
      const files = makeProject({ [SKILL]: "# An older skill\n" })

      yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.read(SKILL)).toBe("# An older skill\n")
      expect(doctor.output).toContain(
        "`.agents/skills/adamantite` differs from the Adamantite skill of the installed version."
      )
    })
  )

  it.effect("report a deleted skill file, and write it again in update", () =>
    Effect.gen(function* () {
      const initialized = makeProject()
      yield* runLifecycle("init", initialized, INIT_ARGS)

      // The project after the user deleted the skill file.
      const files = createFileSystemTestContext({
        files: Object.fromEntries(
          initialized
            .list()
            .filter((file) => file !== SKILL)
            .map((file) => [file, initialized.read(file)])
        ),
      })

      const doctor = yield* runLifecycle("doctor", files)
      const update = yield* runLifecycle("update", files)

      expect(doctor.output).toContain(
        "The selection includes agent guidance, and `.agents/skills/adamantite` has no `SKILL.md`."
      )
      expect(files.read(SKILL)).toBe(shippedSkill["SKILL.md"])
      expect(update.output).toContain(`✔ \`${SKILL}\` created.`)
    })
  )

  // `npx skills update` would write the folders that Adamantite owns. The lock belongs to the
  // `skills` CLI, so update leaves it as it is, and Doctor hands the edit off.
  it.effect("keep a skills lock that records the skill, and report its entry", () =>
    Effect.gen(function* () {
      const lock =
        '{ "version": 1, "skills": { "adamantite": { "source": "./node_modules/adamantite" } } }\n'

      const files = makeProject({ "skills-lock.json": lock })

      yield* runLifecycle("init", files, INIT_ARGS)
      const update = yield* runLifecycle("update", files)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.read("skills-lock.json")).toBe(lock)
      expect(update.output).toContain("The skills lock records the Adamantite skill")
      expect(doctor.output).toContain(
        "Remove the `adamantite` entry from `skills` in `skills-lock.json`."
      )
    })
  )

  it.effect("delete the files when the selection no longer names agent guidance", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const { selection, written } = readLockfile(files)

      files.write(
        LOCKFILE_PATH,
        makeLockfileFile({ ...selection, agents: false }, written)[LOCKFILE_PATH]
      )

      yield* runLifecycle("update", files)

      expect({ agents: files.exists(AGENTS), skill: files.exists(SKILL) }).toStrictEqual({
        agents: false,
        skill: false,
      })
    })
  )
})
