import { RuleTester } from "oxlint/plugins-dev"
import { describe, expect, it } from "vitest"
import {
  createNoAvoidedTermsRule,
  hasPhrase,
  parseGlossary,
  splitWords,
} from "#presets/lint/plugin/rules/no-avoided-terms.ts"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const GLOSSARY = [
  "# 100times",
  "",
  "**Goal**:",
  "Something a person sets out to do 100 times.",
  "_Avoid_: Habit, challenge, streak",
  "",
  "**Chain**:",
  "The run of check-ins without a gap.",
  "_Avoid_: Streak, mode",
  "",
  "**Managed plugin**:",
  "A third-party Oxlint plugin that stays an npm package.",
  "_Avoid_: Vendored bundle, dependency",
  "",
  "**Preset**:",
  "Published configuration.",
  "_Avoid_: Plugin, template",
  "",
].join("\n")

// Every file is below the same glossary, except the files in `/no-glossary`. The fixture test
// covers the real glossary lookup.
const rule = createNoAvoidedTermsRule({
  readGlossary: (file) => (file.startsWith("/no-glossary/") ? undefined : GLOSSARY),
})

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

function nameMessage(name: string, term: string, preferred: string) {
  return `\`${name}\` uses \`${term}\`, which \`GLOSSARY.md\` says to avoid. Use ${preferred}, or add \`${term}\` to the rule's \`allow\` option when it means something else in this project.`
}

tester.run("no-avoided-terms", rule, {
  invalid: [
    {
      code: "export function findStreaks() {}",
      errors: [
        {
          column: 16,
          line: 1,
          message: nameMessage("findStreaks", "streak", "`Goal` or `Chain`"),
        },
      ],
    },
    {
      code: "const STREAK_DAYS = 3",
      errors: [{ message: nameMessage("STREAK_DAYS", "streak", "`Goal` or `Chain`") }],
    },
    {
      code: "type HabitList = string[]",
      errors: [{ message: nameMessage("HabitList", "Habit", "`Goal`") }],
    },
    {
      code: "interface Challenge {}\nclass ChallengeView {}\nenum ChallengeKind {}",
      errors: [
        { line: 1, messageId: "name" },
        { line: 2, messageId: "name" },
        { line: 3, messageId: "name" },
      ],
    },
    {
      code: "const view = <p>Your streak is 3 days.</p>",
      errors: [
        {
          message:
            "This text uses `streak`, which `GLOSSARY.md` says to avoid. Use `Goal` or `Chain`, or add `streak` to the rule's `allow` option when it means something else in this project.",
        },
      ],
    },
    {
      // A multi-word term matches the words of a name in order.
      code: "const vendoredBundles = []",
      errors: [{ message: nameMessage("vendoredBundles", "Vendored bundle", "`Managed plugin`") }],
    },
    {
      code: "const habitMode = 1",
      errors: [
        { message: nameMessage("habitMode", "Habit", "`Goal`") },
        { message: nameMessage("habitMode", "mode", "`Chain`") },
      ],
    },
    {
      // `allow` turns off only the terms it lists.
      code: "const habitMode = 1",
      errors: [{ message: nameMessage("habitMode", "Habit", "`Goal`") }],
      options: [{ allow: ["Mode"] }],
    },
  ],
  valid: [
    // Names that the code does not declare mirror another API.
    'import { streak } from "tracker"\nconst value = data.streak\nconst config = { mode: "dark" }',
    "const { mode } = options",
    "function run(streak: number) {\n  return streak\n}",
    // `plugin` is part of the glossary term `Managed plugin`, so the project uses it.
    "const managedPlugins = []\nconst jsPlugins = []",
    // A word that only contains an avoided term is another word.
    "const modern = true\nconst habitual = false",
    {
      code: "const habitMode = 1",
      options: [{ allow: ["habit", "mode"] }],
    },
    { code: "const streak = 1", filename: "/no-glossary/index.ts" },
  ],
})

describe("parseGlossary", () => {
  it("read each avoided term with the glossary terms to use instead", () => {
    expect(
      parseGlossary(GLOSSARY).map((term) => ({ name: term.name, preferred: term.preferred }))
    ).toStrictEqual([
      { name: "Habit", preferred: ["Goal"] },
      { name: "challenge", preferred: ["Goal"] },
      { name: "streak", preferred: ["Goal", "Chain"] },
      { name: "mode", preferred: ["Chain"] },
      { name: "Vendored bundle", preferred: ["Managed plugin"] },
      { name: "dependency", preferred: ["Managed plugin"] },
      { name: "template", preferred: ["Preset"] },
    ])
  })

  it("leave out a term that is part of a glossary term", () => {
    expect(parseGlossary(GLOSSARY).map((term) => term.name)).not.toContain("Plugin")
  })

  it("read nothing from a text without avoided terms", () => {
    expect(parseGlossary("# Glossary\n\n**Goal**:\nA goal.\n")).toStrictEqual([])
  })
})

describe("splitWords", () => {
  it("split names in each case style into singular words", () => {
    expect(splitWords("findStreaks")).toStrictEqual(["find", "streak"])
    expect(splitWords("STREAK_DAYS")).toStrictEqual(["streak", "day"])
    expect(splitWords("HTMLEntries")).toStrictEqual(["html", "entry"])
    expect(splitWords("check-in progress")).toStrictEqual(["check", "in", "progress"])
  })
})

describe("hasPhrase", () => {
  it("match a run of whole words", () => {
    expect(hasPhrase(["vendored", "bundle", "path"], ["vendored", "bundle"])).toBe(true)
    expect(hasPhrase(["bundle", "vendored"], ["vendored", "bundle"])).toBe(false)
    expect(hasPhrase(["vendored"], [])).toBe(false)
  })
})
