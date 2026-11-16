import { describe, expect, it } from "@effect/vitest"
import * as Array from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import architecture from "../../docs/architecture.md?raw"
import config from "../../oxlint.config.ts"

const Layer = Schema.Struct({
  imports: Schema.Array(Schema.String),
  layers: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Struct({ imports: Schema.Array(Schema.String) }))
  ),
})

const LayerMap = Schema.Struct({
  layers: Schema.Record(Schema.String, Layer),
  root: Schema.String,
})

const LayersRule = Schema.TupleWithRest(Schema.Tuple([Schema.Literal("error")]), [LayerMap])

interface Row {
  readonly folder: string
  readonly imports: readonly string[]
}

const byFolder = Order.mapInput(Order.String, (row: Row) => row.folder)

/**
 * Each layer of the `src` map and of the maps that it nests, with its folder and its direct
 * imports.
 */
function listMapLayers() {
  const [, ...maps] = Schema.decodeSync(LayersRule)(config.rules["adamantite/layers"])

  return maps
    .filter((map) => map.root === "src")
    .flatMap((map) =>
      Object.entries(map.layers).flatMap(([name, layer]): Row[] => [
        { folder: `${map.root}/${name}`, imports: layer.imports },
        ...Object.entries(layer.layers ?? {}).map(([child, { imports }]) => ({
          folder: `${map.root}/${name}/${child}`,
          imports,
        })),
      ])
    )
}

const IMPORT_NAME = /^`([\w-]+)`$/u

/**
 * The imports that one cell of the layer table states: exactly "None", or a comma-separated list of
 * backtick-quoted layer names. Any other entry stays in the list as `invalid: <text>`, so the
 * comparison with the layer map fails and shows it.
 */
function parseImportsCell(cell: string): string[] {
  const text = cell.trim()

  return text === "None"
    ? []
    : text
        .split(",")
        .map((entry) => IMPORT_NAME.exec(entry.trim())?.[1] ?? `invalid: ${entry.trim()}`)
}

/**
 * The rows of the layer table in `docs/architecture.md`: a folder, a job, and the imports, such as
 * `` | `src/lib/setup` | … | `integrations` | ``.
 */
function listDocumentedLayers() {
  return architecture.split("\n").flatMap((line): Row[] => {
    const match = /^\| `(src\/[\w/-]+)` +\|[^|]+\|([^|]+)\|$/u.exec(line)

    if (match === null) {
      return []
    }

    const [, folder = "", imports = ""] = match

    return [{ folder, imports: parseImportsCell(imports) }]
  })
}

describe("docs/architecture.md", () => {
  it("list each layer of the src map with its imports", () => {
    expect(Array.sort(listDocumentedLayers(), byFolder)).toStrictEqual(
      Array.sort(listMapLayers(), byFolder)
    )
  })
})
