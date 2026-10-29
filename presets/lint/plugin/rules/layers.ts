import type { Context, ESTree, Options, Rule, Visitor } from "@oxlint/plugins"
import { existsSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import { globToRegExp } from "../glob.ts"
import { isStringLiteral } from "../imports.ts"
import {
  readBooleanOption,
  readStringArrayOption,
  readStringArrayRecordOption,
  readStringOption,
} from "../options.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs: Node.js built-ins that Bun also provides, and only types from packages.

/**
 * Each layer by folder name, with the layers directly below it. Imports are transitive: a layer
 * imports the layers it lists and every layer that those import.
 */
export type LayerMap = Readonly<Record<string, readonly string[]>>

export interface LayersOptions {
  /**
   * Composition files, by glob below the root. An entry imports any layer, and no layer imports an
   * entry.
   */
  readonly entries: readonly RegExp[]
  /**
   * Importers that the rule does not check, by glob below the root.
   */
  readonly ignore: readonly RegExp[]
  readonly ignoreTypes: boolean
  /**
   * Layers whose units do not import each other.
   */
  readonly isolate: ReadonlySet<string>
  readonly layers: LayerMap
  /**
   * One pattern for each segment of the root, relative to the package folder.
   */
  readonly root: readonly RegExp[]
}

type JsonValue = Options[number]
type JsonObject = Exclude<JsonValue, JsonValue[] | boolean | number | string | null>

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isJsonString(value: JsonValue | undefined): value is string {
  return typeof value === "string"
}

/**
 * The nearest folder with a `package.json`, and the `imports` field of that file.
 */
export interface PackageScope {
  readonly dir: string
  readonly imports: JsonObject
}

/**
 * Where a file sits below the root.
 */
export type Location =
  | { readonly kind: "entry"; readonly path: string }
  | { readonly kind: "layer"; readonly layer: string; readonly unit: string | undefined }
  | { readonly kind: "unmappedFile"; readonly path: string }
  | { readonly kind: "unmappedFolder"; readonly folder: string; readonly path: string }

type LayerLocation = Extract<Location, { kind: "layer" }>

export type Violation =
  | "entry"
  | "isolated"
  | "sibling"
  | "unmappedFile"
  | "unmappedFolder"
  | "upward"

export type MapError =
  | { readonly kind: "cycle"; readonly cycle: readonly string[] }
  | { readonly kind: "unknownImport"; readonly layer: string; readonly name: string }
  | { readonly kind: "unknownIsolate"; readonly name: string }

const LAYER_MAP_HINT = "Layer map: `adamantite/layers` options in the Oxlint config."

function toPosixPath(path: string) {
  return path.replaceAll("\\", "/")
}

/**
 * Read the rule options. Undefined when `root` or `layers` is missing.
 */
export function readLayersOptions(options: Readonly<Options>): LayersOptions | undefined {
  const root = readStringOption(options, "root")
  const layers = readStringArrayRecordOption(options, "layers")

  if (root === undefined || layers === undefined) {
    return undefined
  }

  return {
    entries: (readStringArrayOption(options, "entries") ?? []).map((glob) => globToRegExp(glob)),
    ignore: (readStringArrayOption(options, "ignore") ?? []).map((glob) => globToRegExp(glob)),
    ignoreTypes: readBooleanOption(options, "ignoreTypes") ?? false,
    isolate: new Set(readStringArrayOption(options, "isolate")),
    layers,
    root: root
      .split("/")
      .filter((segment) => segment !== "" && segment !== ".")
      .map((segment) => globToRegExp(segment)),
  }
}

/**
 * Find the layers that `name` imports, including itself.
 */
export function listImportable(layers: LayerMap, name: string): ReadonlySet<string> {
  const importable = new Set<string>()
  const pending = [name]

  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (!importable.has(next)) {
      importable.add(next)
      pending.push(...(layers[next] ?? []))
    }
  }

  return importable
}

function findCycle(layers: LayerMap): readonly string[] | undefined {
  const done = new Set<string>()

  function visit(name: string, path: readonly string[]): readonly string[] | undefined {
    const start = path.indexOf(name)

    if (start !== -1) {
      return [...path.slice(start), name]
    }

    if (done.has(name)) {
      return undefined
    }

    for (const below of layers[name] ?? []) {
      const cycle = visit(below, [...path, name])

      if (cycle !== undefined) {
        return cycle
      }
    }

    done.add(name)

    return undefined
  }

  for (const name of Object.keys(layers)) {
    const cycle = visit(name, [])

    if (cycle !== undefined) {
      return cycle
    }
  }

  return undefined
}

/**
 * Find the mistakes in a layer map: a name that is not a layer, and a cycle.
 */
export function findMapErrors(layers: LayerMap, isolate: ReadonlySet<string>): MapError[] {
  const errors: MapError[] = []

  for (const [layer, imports] of Object.entries(layers)) {
    for (const name of imports) {
      if (!Object.hasOwn(layers, name)) {
        errors.push({ kind: "unknownImport", layer, name })
      }
    }
  }

  for (const name of isolate) {
    if (!Object.hasOwn(layers, name)) {
      errors.push({ kind: "unknownIsolate", name })
    }
  }

  const cycle = findCycle(layers)

  if (cycle !== undefined) {
    errors.push({ cycle, kind: "cycle" })
  }

  return errors
}

function pickImportTarget(target: JsonValue | undefined): string | undefined {
  if (isJsonString(target)) {
    return target
  }

  let entries: JsonValue[] = []

  if (Array.isArray(target)) {
    entries = target
  } else if (isJsonObject(target)) {
    entries = Object.values(target)
  }

  for (const entry of entries) {
    const picked = pickImportTarget(entry)

    if (picked !== undefined) {
      return picked
    }
  }

  return undefined
}

/**
 * Resolve a `#` specifier through the `imports` field of `package.json`: an exact key, or the
 * pattern with the longest prefix before its `*`. A condition object gives its first string
 * target.
 */
function resolveSubpathImport(specifier: string, imports: JsonObject): string | undefined {
  if (Object.hasOwn(imports, specifier)) {
    return pickImportTarget(imports[specifier])
  }

  let match: { readonly key: string; readonly rest: string } | undefined

  for (const key of Object.keys(imports)) {
    const star = key.indexOf("*")

    if (star === -1 || key.includes("*", star + 1)) {
      continue
    }

    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)

    if (
      specifier.length >= key.length - 1
      && specifier.startsWith(prefix)
      && specifier.endsWith(suffix)
      && (match === undefined || prefix.length > match.key.indexOf("*"))
    ) {
      match = { key, rest: specifier.slice(prefix.length, specifier.length - suffix.length) }
    }
  }

  if (match === undefined) {
    return undefined
  }

  return pickImportTarget(imports[match.key])?.replaceAll("*", match.rest)
}

/**
 * Resolve an import specifier to a path with forward slashes. A relative specifier resolves from
 * the importing file, and a `#` specifier through the `imports` field of the package. Undefined for
 * a package specifier, or for a `#` specifier that maps to a package.
 */
export function resolveImport(
  specifier: string,
  importer: string,
  scope: PackageScope
): string | undefined {
  if (specifier.startsWith(".")) {
    return posix.join(posix.dirname(importer), specifier)
  }

  if (!specifier.startsWith("#")) {
    return undefined
  }

  const target = resolveSubpathImport(specifier, scope.imports)

  return target?.startsWith("./") ? posix.join(scope.dir, target) : undefined
}

/**
 * Split a path relative to the package folder at the root. Undefined when the path is not below the
 * root.
 */
export function splitAtRoot(
  root: readonly RegExp[],
  relative: string
): { readonly below: readonly string[]; readonly root: string } | undefined {
  const segments = relative.split("/")

  if (
    segments.length <= root.length
    || !root.every((part, index) => part.test(segments[index] ?? ""))
  ) {
    return undefined
  }

  return { below: segments.slice(root.length), root: segments.slice(0, root.length).join("/") }
}

function getUnit(inside: readonly string[]) {
  const [first = ""] = inside

  // `routes/settings.tsx` and `routes/settings/` are the same unit.
  return inside.length === 1 ? first.replace(/\.[^.]+$/, "") : first
}

/**
 * Find where a file sits, from its segments below the root.
 */
export function locate(options: LayersOptions, root: string, below: readonly string[]): Location {
  const path = below.join("/")

  if (options.entries.some((pattern) => pattern.test(path))) {
    return { kind: "entry", path }
  }

  const [top = "", ...inside] = below

  if (inside.length === 0) {
    return { kind: "unmappedFile", path: `${root}/${path}` }
  }

  if (!Object.hasOwn(options.layers, top)) {
    return { folder: top, kind: "unmappedFolder", path: `${root}/${top}` }
  }

  return { kind: "layer", layer: top, unit: options.isolate.has(top) ? getUnit(inside) : undefined }
}

/**
 * Find the rule that an import from `from` to `to` breaks. Only layers are checked: an entry
 * imports anything, and an unmapped file is reported once on its own.
 */
export function findViolation(
  layers: LayerMap,
  from: Location,
  to: Location
): Violation | undefined {
  if (from.kind !== "layer") {
    return undefined
  }

  if (to.kind !== "layer") {
    return to.kind
  }

  if (from.layer === to.layer) {
    return from.unit === to.unit ? undefined : "isolated"
  }

  if (listImportable(layers, from.layer).has(to.layer)) {
    return undefined
  }

  return listImportable(layers, to.layer).has(from.layer) ? "upward" : "sibling"
}

/**
 * Keep the names that no other name imports: the highest layers.
 */
function keepHighest(layers: LayerMap, names: readonly string[]) {
  return names.filter(
    (name) => !names.some((other) => other !== name && listImportable(layers, other).has(name))
  )
}

/**
 * Keep the names that import no other name: the lowest layers.
 */
function keepLowest(layers: LayerMap, names: readonly string[]) {
  return names.filter(
    (name) => !names.some((other) => other !== name && listImportable(layers, name).has(other))
  )
}

/**
 * The highest layers that both `from` and `to` import, where code that both need can move. For two
 * units of one layer, the layer itself does not count.
 */
export function findLowerRepairs(layers: LayerMap, from: string, to: string): string[] {
  const fromImportable = listImportable(layers, from)
  const toImportable = listImportable(layers, to)
  const common = Object.keys(layers).filter(
    (name) => fromImportable.has(name) && toImportable.has(name) && (from !== to || name !== from)
  )

  return keepHighest(layers, common)
}

/**
 * The lowest layers that import both `from` and `to`, where the importing file can move, in layer
 * map order. For two units of one layer, the layer itself does not count.
 */
export function findUpperRepairs(layers: LayerMap, from: string, to: string): string[] {
  const candidates = Object.keys(layers).filter((name) => {
    const importable = listImportable(layers, name)

    return importable.has(from) && importable.has(to) && (from !== to || name !== from)
  })

  return keepLowest(layers, candidates)
}

function formatList(names: readonly string[]) {
  const quoted = names.map((name) => `\`${name}\``)

  if (quoted.length <= 2) {
    return quoted.join(" or ")
  }

  return `${quoted.slice(0, -1).join(", ")}, or ${quoted.at(-1) ?? ""}`
}

/**
 * The repair sentence for a layer violation, with a leading space, or an empty string when the map
 * allows no repair.
 */
export function describeRepairs(
  violation: "isolated" | "sibling" | "upward",
  lower: readonly string[],
  upper: readonly string[]
): string {
  const parts: string[] = []

  if (lower.length > 0) {
    const need = violation === "upward" ? "this file needs" : "both need"

    parts.push(`move the code that ${need} down to ${formatList(lower)}`)
  }

  if (upper.length > 0) {
    parts.push(
      violation === "isolated"
        ? `compose them in ${formatList(upper)}`
        : `move this file up to ${formatList(upper)}`
    )
  }

  const text = parts.join(", or ")

  return text === "" ? "" : ` ${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

function describeLayer(location: LayerLocation) {
  return location.unit === undefined ? location.layer : `${location.layer}/${location.unit}`
}

function readImports(file: string): JsonObject {
  try {
    const manifest: JsonValue = JSON.parse(readFileSync(file, "utf8"))
    const imports = isJsonObject(manifest) ? manifest["imports"] : undefined

    if (isJsonObject(imports)) {
      return imports
    }
  } catch {
    // A `package.json` that does not parse has no `imports` that the rule can follow.
  }

  return {}
}

// Oxlint caches the loaded plugin, so an editor language server needs a restart after a
// `package.json` changes.
const scopes = new Map<string, PackageScope | undefined>()

function findPackageScope(dir: string): PackageScope | undefined {
  if (scopes.has(dir)) {
    return scopes.get(dir)
  }

  const file = posix.join(dir, "package.json")
  const parent = posix.dirname(dir)
  let scope: PackageScope | undefined

  if (existsSync(file)) {
    scope = { dir, imports: readImports(file) }
  } else if (parent !== dir) {
    scope = findPackageScope(parent)
  }

  scopes.set(dir, scope)

  return scope
}

function isTypeOnlyImport(node: ESTree.ImportDeclaration) {
  return (
    node.importKind === "type"
    || (node.specifiers.length > 0
      && node.specifiers.every(
        (specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type"
      ))
  )
}

function isTypeOnlyExport(node: ESTree.ExportNamedDeclaration) {
  return (
    node.exportKind === "type"
    || (node.specifiers.length > 0
      && node.specifiers.every((specifier) => specifier.exportKind === "type"))
  )
}

/**
 * A linted file below the root, with what the rule needs to check its imports.
 */
interface LintedFile {
  readonly importer: string
  readonly options: LayersOptions
  readonly root: string
  readonly scope: PackageScope
}

function formatCycle(cycle: readonly string[]) {
  return cycle.map((name) => `\`${name}\``).join(" → ")
}

function reportFile(
  context: Context,
  node: ESTree.Program,
  from: Location,
  errors: readonly MapError[]
) {
  for (const error of errors) {
    if (error.kind === "cycle") {
      context.report({ data: { cycle: formatCycle(error.cycle) }, messageId: "cycle", node })
    } else if (error.kind === "unknownImport") {
      context.report({
        data: { layer: error.layer, name: error.name },
        messageId: "unknownImport",
        node,
      })
    } else {
      context.report({ data: { name: error.name }, messageId: "unknownIsolate", node })
    }
  }

  if (from.kind === "unmappedFolder") {
    context.report({
      data: { folder: from.folder, path: from.path },
      messageId: "unmappedFolder",
      node,
    })
  } else if (from.kind === "unmappedFile") {
    context.report({ data: { path: from.path }, messageId: "unmappedFile", node })
  }
}

function checkImport(
  context: Context,
  file: LintedFile,
  from: LayerLocation,
  source: ESTree.StringLiteral,
  typeOnly: boolean
) {
  const { options } = file

  if (typeOnly && options.ignoreTypes) {
    return
  }

  const target = resolveImport(source.value, file.importer, file.scope)
  const split =
    target === undefined
      ? undefined
      : splitAtRoot(options.root, posix.relative(file.scope.dir, target))

  // A target in another root, such as another app of a monorepo, is outside this map.
  if (split === undefined || split.root !== file.root) {
    return
  }

  const to = locate(options, split.root, split.below)
  const violation = findViolation(options.layers, from, to)

  if (violation === undefined) {
    return
  }

  if (to.kind === "entry") {
    context.report({
      data: { from: describeLayer(from), to: to.path },
      messageId: "entry",
      node: source,
    })
  } else if (to.kind === "unmappedFolder") {
    context.report({
      data: { folder: to.folder, path: to.path },
      messageId: "unmappedFolder",
      node: source,
    })
  } else if (to.kind === "unmappedFile") {
    context.report({ data: { path: to.path }, messageId: "unmappedFile", node: source })
  } else if (violation === "isolated" || violation === "sibling" || violation === "upward") {
    const repair = describeRepairs(
      violation,
      findLowerRepairs(options.layers, from.layer, to.layer),
      findUpperRepairs(options.layers, from.layer, to.layer)
    )

    context.report({
      data: { from: describeLayer(from), layer: from.layer, repair, to: describeLayer(to) },
      messageId: violation,
      node: source,
    })
  }
}

/**
 * Create the rule with the function that finds the package of a folder. The plugin passes one that
 * reads `package.json` files, and unit tests pass one that does not touch the file system.
 */
export function createLayersRule(findScope: (dir: string) => PackageScope | undefined): Rule {
  return {
    create(context): Visitor {
      const options = readLayersOptions(context.options)
      const importer = toPosixPath(context.filename)
      const scope = findScope(posix.dirname(importer))

      if (options === undefined || scope === undefined) {
        return {}
      }

      const split = splitAtRoot(options.root, posix.relative(scope.dir, importer))

      if (
        split === undefined
        || options.ignore.some((pattern) => pattern.test(split.below.join("/")))
      ) {
        return {}
      }

      const from = locate(options, split.root, split.below)
      const errors = findMapErrors(options.layers, options.isolate)

      if (errors.length > 0 || from.kind !== "layer") {
        return {
          Program(node) {
            reportFile(context, node, from, errors)
          },
        }
      }

      const file: LintedFile = { importer, options, root: split.root, scope }

      return {
        ExportAllDeclaration(node) {
          checkImport(context, file, from, node.source, node.exportKind === "type")
        },
        ExportNamedDeclaration(node) {
          if (node.source !== null) {
            checkImport(context, file, from, node.source, isTypeOnlyExport(node))
          }
        },
        ImportDeclaration(node) {
          checkImport(context, file, from, node.source, isTypeOnlyImport(node))
        },
        ImportExpression(node) {
          if (isStringLiteral(node.source)) {
            checkImport(context, file, from, node.source, false)
          }
        },
        TSImportType(node) {
          checkImport(context, file, from, node.source, true)
        },
      }
    },
    meta: {
      docs: {
        description:
          "Enforce one-way imports between the layers of a folder, from a layer map in the rule options.",
      },
      messages: {
        cycle: `The layer map has a cycle: {{cycle}}. Layers import in one direction. ${LAYER_MAP_HINT}`,
        entry: `\`{{from}}\` cannot import the entry \`{{to}}\`: no layer imports an entry. Move the code that it needs into a layer. ${LAYER_MAP_HINT}`,
        isolated: `\`{{from}}\` cannot import \`{{to}}\`: units in \`{{layer}}\` do not import each other.{{repair}} ${LAYER_MAP_HINT}`,
        sibling: `\`{{from}}\` cannot import \`{{to}}\`: they are siblings.{{repair}} ${LAYER_MAP_HINT}`,
        unknownImport: `\`{{layer}}\` imports \`{{name}}\`, which is not a layer. ${LAYER_MAP_HINT}`,
        unknownIsolate: `\`isolate\` lists \`{{name}}\`, which is not a layer. ${LAYER_MAP_HINT}`,
        unmappedFile: `\`{{path}}\` is in no layer. Move it into a layer folder, or list it in \`entries\`. ${LAYER_MAP_HINT}`,
        unmappedFolder: `\`{{path}}\` is in no layer. Add \`{{folder}}\` to the layer map, with the layers that it imports. ${LAYER_MAP_HINT}`,
        upward: `\`{{from}}\` cannot import \`{{to}}\`: it is a higher layer.{{repair}} ${LAYER_MAP_HINT}`,
      },
      schema: [
        {
          additionalProperties: false,
          properties: {
            entries: { items: { type: "string" }, type: "array" },
            ignore: { items: { type: "string" }, type: "array" },
            ignoreTypes: { type: "boolean" },
            isolate: { items: { type: "string" }, type: "array" },
            layers: {
              additionalProperties: { items: { type: "string" }, type: "array" },
              type: "object",
            },
            root: { type: "string" },
          },
          required: ["layers", "root"],
          type: "object",
        },
      ],
      type: "problem",
    },
  }
}

const rule: Rule = createLayersRule(findPackageScope)

export default rule
