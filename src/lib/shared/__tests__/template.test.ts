import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import { fillTemplate } from "#lib/shared/template.ts"

// Two common names, so that slots repeat and a value can name another slot.
const slotName = Schema.Union([
  Schema.Literals(["a", "name"]),
  Schema.String.check(Schema.isPattern(/^\w{1,8}$/)),
])

// Text that a template holds between slots, which cannot open a slot.
const text = Schema.String.check(Schema.isPattern(/^[^{}]*$/))

// Any value, and the values that a regular expression replacement or a second pass would change.
const value = Schema.Union([
  Schema.String,
  Schema.Literals(["$&", "$1", "$$", "{{a}}", "{{name}}"]),
])

describe("fillTemplate", () => {
  it.prop(
    "replace each slot with its value, and keep the value literal",
    { parts: Schema.Array(Schema.Tuple([text, slotName, value])), tail: text },
    ({ parts, tail }) => {
      const template = parts.map(([before, name]) => `${before}{{${name}}}`).join("") + tail
      // A name that repeats takes its last value, as `Object.fromEntries` gives it.
      const slots = Object.fromEntries(parts.map(([, name, slot]) => [name, slot]))
      const expected = parts.map(([before, name]) => `${before}${slots[name]}`).join("") + tail

      expect(fillTemplate(template, slots)).toBe(expected)
    }
  )

  it.prop(
    "keep a slot without a value as written",
    { name: Schema.Union([slotName, Schema.Literals(["constructor", "toString", "__proto__"])]) },
    ({ name }) => {
      expect(fillTemplate(`{{${name}}}`, {})).toBe(`{{${name}}}`)
    }
  )
})
