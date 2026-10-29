import type { ESTree, Rule, Visitor } from "@oxlint/plugins"
import { existsSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import { readStringArrayOption } from "../options.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs: Node.js built-ins that Bun also provides.

/**
 * A term that the glossary says to avoid, with the glossary terms to use instead.
 */
export interface AvoidedTerm {
  /**
   * The avoided term as the glossary states it, such as `Streak`.
   */
  readonly name: string
  readonly preferred: readonly string[]
  readonly words: readonly string[]
}

/**
 * What the rule reads from the file system. The plugin reads real files, and unit tests pass fakes.
 */
export interface Project {
  /**
   * The text of the nearest `GLOSSARY.md` at or above the folder of `file`, or undefined when there
   * is none.
   */
  readonly readGlossary: (file: string) => string | undefined
}

const GLOSSARY = "GLOSSARY.md"

const TERM = /^\*\*(.+?)\*\*:\s*$/u

const AVOID = /^_Avoid_:\s*(.+?)\s*$/u

/**
 * Split a name or a text into lowercase words, such as `["find", "streaks"]` for `findStreaks`.
 */
export function splitWords(text: string): string[] {
  return text
    .replaceAll(/([a-z\d])([A-Z])/gu, "$1 $2")
    .replaceAll(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z\d]+/u)
    .filter((word) => word !== "")
}

/**
 * Whether `plural` is `word` or a regular plural of it, such as `streaks`, `fixes`, `caches`, or
 * `entries`. Turning plurals back into singulars cannot tell `caches` from `fixes`, so the rule
 * builds the plurals of the shorter word instead.
 */
function isPluralOf(plural: string, word: string) {
  return (
    plural === word
    || plural === `${word}s`
    || plural === `${word}es`
    || (word.endsWith("y") && plural === `${word.slice(0, -1)}ies`)
  )
}

/**
 * Whether two words are the same word, in the singular or a regular plural. The glossary can list
 * either form, such as `boundaries`.
 */
function isSameWord(left: string | undefined, right: string) {
  return left !== undefined && (isPluralOf(left, right) || isPluralOf(right, left))
}

/**
 * Whether `words` holds `phrase` as a run of whole words, in the singular or a regular plural.
 */
export function hasPhrase(words: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0) {
    return false
  }

  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    if (phrase.every((word, index) => isSameWord(words[start + index], word))) {
      return true
    }
  }

  return false
}

/**
 * Read the avoided terms from the text of a glossary: each `_Avoid_:` line lists the terms to avoid
 * for the `**Term**:` above it. A term that is part of a glossary term, such as `plugin` when the
 * glossary defines `Managed plugin`, is left out, because the project uses it in another sense.
 */
export function parseGlossary(text: string): AvoidedTerm[] {
  const defined: string[] = []
  const avoided = new Map<string, { name: string; preferred: string[] }>()
  let current: string | undefined

  for (const line of text.split("\n")) {
    const term = TERM.exec(line.trim())?.[1]?.trim()

    if (term !== undefined) {
      current = term
      defined.push(term)
      continue
    }

    const list = AVOID.exec(line.trim())?.[1]

    if (list === undefined || current === undefined) {
      continue
    }

    for (const name of list.split(",").map((entry) => entry.trim().replace(/\.$/u, ""))) {
      const key = splitWords(name).join(" ")

      if (key === "") {
        continue
      }

      const entry = avoided.get(key)

      if (entry === undefined) {
        avoided.set(key, { name, preferred: [current] })
      } else if (!entry.preferred.includes(current)) {
        entry.preferred.push(current)
      }
    }
  }

  const definedWords = defined.map((term) => splitWords(term))

  return [...avoided.values()]
    .map((entry) => ({
      name: entry.name,
      preferred: entry.preferred,
      words: splitWords(entry.name),
    }))
    .filter((entry) => !definedWords.some((words) => hasPhrase(words, entry.words)))
}

function formatList(names: readonly string[]) {
  const quoted = names.map((name) => `\`${name}\``)

  if (quoted.length <= 2) {
    return quoted.join(" or ")
  }

  return `${quoted.slice(0, -1).join(", ")}, or ${quoted.at(-1) ?? ""}`
}

const glossaryPaths = new Map<string, string | undefined>()

function findGlossary(dir: string): string | undefined {
  if (glossaryPaths.has(dir)) {
    return glossaryPaths.get(dir)
  }

  const parent = posix.dirname(dir)
  let found: string | undefined

  if (existsSync(posix.join(dir, GLOSSARY))) {
    found = posix.join(dir, GLOSSARY)
  } else if (parent !== dir) {
    found = findGlossary(parent)
  }

  glossaryPaths.set(dir, found)

  return found
}

// Oxlint caches the loaded plugin, so an editor language server needs a restart after the glossary
// changes.
const glossaries = new Map<string, string>()

const project: Project = {
  readGlossary: (file) => {
    const path = findGlossary(posix.dirname(file.replaceAll("\\", "/")))

    if (path === undefined) {
      return
    }

    let text = glossaries.get(path)

    if (text === undefined) {
      text = readFileSync(path, "utf8")
      glossaries.set(path, text)
    }

    return text
  },
}

const parsed = new Map<string, readonly AvoidedTerm[]>()

function readAvoidedTerms(text: string) {
  let terms = parsed.get(text)

  if (terms === undefined) {
    terms = parseGlossary(text)
    parsed.set(text, terms)
  }

  return terms
}

export function createNoAvoidedTermsRule(project: Project): Rule {
  return {
    create(context): Visitor {
      const text = project.readGlossary(context.filename)

      if (text === undefined) {
        return {}
      }

      const allowed = new Set(
        (readStringArrayOption(context.options, "allow") ?? []).map((name) =>
          splitWords(name).join(" ")
        )
      )
      const terms = readAvoidedTerms(text).filter((term) => !allowed.has(term.words.join(" ")))

      if (terms.length === 0) {
        return {}
      }

      function checkName(node: ESTree.BindingIdentifier | null) {
        if (node === null) {
          return
        }

        const words = splitWords(node.name)

        for (const term of terms) {
          if (hasPhrase(words, term.words)) {
            context.report({
              data: { name: node.name, preferred: formatList(term.preferred), term: term.name },
              messageId: "name",
              node,
            })
          }
        }
      }

      return {
        ClassDeclaration(node) {
          checkName(node.id)
        },
        ClassExpression(node) {
          checkName(node.id)
        },
        FunctionDeclaration(node) {
          checkName(node.id)
        },
        FunctionExpression(node) {
          checkName(node.id)
        },
        JSXText(node) {
          const words = splitWords(node.value)

          for (const term of terms) {
            if (hasPhrase(words, term.words)) {
              context.report({
                data: { preferred: formatList(term.preferred), term: term.name },
                messageId: "text",
                node,
              })
            }
          }
        },
        TSDeclareFunction(node) {
          checkName(node.id)
        },
        TSEnumDeclaration(node) {
          checkName(node.id)
        },
        TSInterfaceDeclaration(node) {
          checkName(node.id)
        },
        TSTypeAliasDeclaration(node) {
          checkName(node.id)
        },
        VariableDeclarator(node) {
          if (node.id.type === "Identifier") {
            checkName(node.id)
          }
        },
      }
    },
    meta: {
      docs: {
        description: "Report names and JSX text that use a term that `GLOSSARY.md` says to avoid.",
      },
      messages: {
        name: "`{{name}}` uses `{{term}}`, which `GLOSSARY.md` says to avoid. Use {{preferred}}, or add `{{term}}` to the rule's `allow` option when it means something else in this project.",
        text: "This text uses `{{term}}`, which `GLOSSARY.md` says to avoid. Use {{preferred}}, or add `{{term}}` to the rule's `allow` option when it means something else in this project.",
      },
      schema: [
        {
          additionalProperties: false,
          properties: {
            allow: { items: { minLength: 1, type: "string" }, type: "array" },
          },
          type: "object",
        },
      ],
      type: "suggestion",
    },
  }
}

const rule: Rule = createNoAvoidedTermsRule(project)

export default rule
