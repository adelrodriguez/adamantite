import { describe, expect, it } from "@effect/vitest"
import { SCRIPT_ORDER } from "#lib/project/package-json.ts"
import { addSelection, INIT_EDITORS, LINT_PRESETS, Selection } from "#lib/project/selection.ts"

// Each list of a selection holds each item once, in the order of its source list.
function isInOrder(list: readonly string[], order: readonly string[]) {
  return list.every(
    (item, index) => index === 0 || order.indexOf(list[index - 1] ?? "") < order.indexOf(item)
  )
}

describe("addSelection", () => {
  it.prop(
    "keep each list in its source order, once per item",
    { next: Selection, previous: Selection },
    ({ next, previous }) => {
      const sum = addSelection(previous, next)

      expect(isInOrder(sum.editors, INIT_EDITORS)).toBe(true)
      expect(isInOrder(sum.presets, ["core", ...LINT_PRESETS])).toBe(true)
      expect(isInOrder(sum.scripts, SCRIPT_ORDER)).toBe(true)
    }
  )

  it.prop(
    "remove nothing that either selection holds",
    { next: Selection, previous: Selection },
    ({ next, previous }) => {
      const sum = addSelection(previous, next)

      // The TypeScript preset and CI take the value of `next`, so init can change them.
      expect({
        agents: sum.agents,
        ci: sum.ci,
        editors: new Set(sum.editors),
        presets: new Set(sum.presets),
        scripts: new Set(sum.scripts),
        typescript: sum.typescript,
      }).toStrictEqual({
        agents: previous.agents || next.agents,
        ci: next.ci ?? previous.ci,
        editors: new Set([...previous.editors, ...next.editors]),
        presets: new Set([...previous.presets, ...next.presets]),
        scripts: new Set([...previous.scripts, ...next.scripts]),
        typescript: next.typescript ?? previous.typescript,
      })
    }
  )

  it.prop(
    "give the same selection when init runs again with the same options",
    { next: Selection, previous: Selection },
    ({ next, previous }) => {
      const sum = addSelection(previous, next)

      expect(addSelection(sum, next)).toStrictEqual(sum)
    }
  )

  it.prop(
    "give the same selection however three runs of init group",
    { a: Selection, b: Selection, c: Selection },
    ({ a, b, c }) => {
      expect(addSelection(addSelection(a, b), c)).toStrictEqual(addSelection(a, addSelection(b, c)))
    }
  )
})
