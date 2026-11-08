import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { parseSync, Visitor } from "oxc-parser"

// Convert declaration nodes without moving scopes or changing dependencies. Nest compatible maps
// separately, so that their settings and physical roots can be checked before removing a root.
const check = process.argv.includes("--check")
const requested = process.argv.slice(2).filter((argument) => argument !== "--check")
const repo = resolve(import.meta.dirname, "..")
const fixtures = join(repo, "src/__tests__/presets/fixtures/layers")
const files =
  requested.length > 0
    ? requested.map((file) => resolve(file))
    : [
        join(repo, "oxlint.config.ts"),
        join(repo, "src/__tests__/plugin/layers.test.ts"),
        ...readdirSync(fixtures).map((model) => join(fixtures, model, "layers.json")),
      ]

const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))

function isRecord(value: Schema.Json): value is Schema.JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function convertJson(value: Schema.Json): Schema.Json {
  if (Array.isArray(value)) {
    return value.map((item: Schema.Json) => convertJson(item))
  }

  if (!isRecord(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === "layers" && isRecord(item)
        ? Object.fromEntries(
            Object.entries(item).map(([name, declaration]) => [
              name,
              Array.isArray(declaration) ? { imports: declaration } : convertJson(declaration),
            ])
          )
        : convertJson(item),
    ])
  )
}

function convertTypeScript(file: string, content: string): string {
  const parsed = parseSync(file, content, { preserveParens: false, sourceType: "module" })

  if (parsed.errors.length > 0) {
    throw new Error(`Cannot parse ${file}`)
  }

  const edits: Array<{ readonly start: number; readonly end: number; readonly content: string }> =
    []
  const visitor = new Visitor({
    Property(property) {
      const key = property.key.type === "Identifier" ? property.key.name : undefined

      if (key !== "layers") {
        return
      }

      if (
        property.value.type === "Identifier"
        && ["LIB_LAYERS", "APP_LAYERS"].includes(property.value.name)
      ) {
        edits.push({
          content: `Object.fromEntries(Object.entries(${property.value.name}).map(([name, imports]) => [name, { imports }]))`,
          end: property.value.end,
          start: property.value.start,
        })
      } else if (property.value.type === "ObjectExpression") {
        for (const layer of property.value.properties) {
          if (layer.type === "Property" && layer.value.type === "ArrayExpression") {
            edits.push({
              content: `{ imports: ${content.slice(layer.value.start, layer.value.end)} }`,
              end: layer.value.end,
              start: layer.value.start,
            })
          }
        }
      }
    },
  })

  visitor.visit(parsed.program)

  let result = content

  for (const edit of EffectArray.sort(
    edits,
    Order.mapInput(Order.flip(Order.Number), (item: (typeof edits)[number]) => item.start)
  )) {
    result = result.slice(0, edit.start) + edit.content + result.slice(edit.end)
  }

  return result
}

for (const file of files) {
  const before = readFileSync(file, "utf8")
  const after = file.endsWith(".json")
    ? `${JSON.stringify(convertJson(parseJson(before)), null, 2)}\n`
    : convertTypeScript(file, before)

  if (
    file.endsWith(".json")
    && JSON.stringify(parseJson(before)) === JSON.stringify(parseJson(after))
  ) {
    continue
  }

  if (before === after) {
    continue
  }

  if (check) {
    throw new Error(`${file} still needs layer declaration conversion`)
  }

  writeFileSync(file, after)
  console.info(`Converted ${file}`)
}
