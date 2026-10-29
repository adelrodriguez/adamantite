import type { Context, ESTree, Options, Rule, Visitor } from "@oxlint/plugins"
import { existsSync } from "node:fs"
import { posix } from "node:path"
import { type NapiResolveOptions, ResolverFactory } from "oxc-resolver"
import { globToRegExp } from "../glob.ts"
import { isStringLiteral } from "../imports.ts"
import {
  readBooleanOption,
  readStringArrayOption,
  readStringArrayRecordOption,
  readStringOption,
} from "../options.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs: Node.js built-ins that Bun also provides, and oxc-resolver, which ships
// Node-API bindings for both.

/**
 * Each layer by folder name, with the layers directly below it. Imports are transitive: a layer
 * imports the layers it lists and every layer that those import.
 */
export type LayerMap = Readonly<Record<string, readonly string[]>>

/**
 * One layer map and its settings: one option object of the rule.
 */
export interface LayersOptions {
  /**
   * Import conditions to match before the default ones, such as the `customConditions` of the
   * target project's `tsconfig.json`.
   */
  readonly conditions: readonly string[]
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
   * The root glob, relative to the package folder.
   */
  readonly root: RegExp
  /**
   * The root glob as the option states it, which messages use to name the map.
   */
  readonly rootGlob: string
}

/**
 * What the rule reads from the file system. The plugin reads real files, and unit tests pass fakes.
 */
export interface Modules {
  /**
   * The nearest folder above `file` that holds a `package.json`.
   */
  readonly findPackage: (file: string) => string | undefined
  /**
   * The file that `specifier` in `importer` resolves to, or undefined when it does not resolve.
   */
  readonly resolve: (
    importer: string,
    specifier: string,
    conditions: readonly string[]
  ) => string | undefined
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

const LAYER_MAP_HINT =
  "Layer map: the `adamantite/layers` options for root `{{root}}` in the Oxlint config."

function toPosixPath(path: string) {
  return path.replaceAll("\\", "/")
}

/**
 * Read one layer map from one option object. Undefined when `root` or `layers` is missing.
 */
function readLayerMap(option: Options[number]): LayersOptions | undefined {
  // The option readers read the first option object.
  const options = [option]
  const root = readStringOption(options, "root")
  const layers = readStringArrayRecordOption(options, "layers")

  if (root === undefined || layers === undefined) {
    return undefined
  }

  return {
    conditions: readStringArrayOption(options, "conditions") ?? [],
    entries: (readStringArrayOption(options, "entries") ?? []).map((glob) => globToRegExp(glob)),
    ignore: (readStringArrayOption(options, "ignore") ?? []).map((glob) => globToRegExp(glob)),
    ignoreTypes: readBooleanOption(options, "ignoreTypes") ?? false,
    isolate: new Set(readStringArrayOption(options, "isolate")),
    layers,
    root: globToRegExp(
      root
        .split("/")
        .filter((segment) => segment !== "" && segment !== ".")
        .join("/")
    ),
    rootGlob: root,
  }
}

/**
 * Read the rule options: one layer map for each option object. A map without `root` or `layers` is
 * left out.
 */
export function readLayersOptions(options: Readonly<Options>): LayersOptions[] {
  return options.flatMap((option) => readLayerMap(option) ?? [])
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

/**
 * Split a path relative to the package folder at the root. Undefined when the path is not below the
 * root.
 */
export function splitAtRoot(
  root: RegExp,
  relative: string
): { readonly below: readonly string[]; readonly root: string } | undefined {
  const segments = relative.split("/")

  // The shortest match, so `**` matches zero or more folders above the root.
  for (let length = 0; length < segments.length; length += 1) {
    const folder = segments.slice(0, length).join("/")

    if (root.test(folder)) {
      return { below: segments.slice(length), root: folder }
    }
  }

  return undefined
}

function getUnit(inside: readonly string[]) {
  const [first = ""] = inside

  // `routes/settings.tsx` and `routes/settings/` are the same unit.
  return inside.length === 1 ? first.replace(/\.[^.]+$/, "") : first
}

export function locate(options: LayersOptions, root: string, below: readonly string[]): Location {
  const path = below.join("/")

  if (options.entries.some((pattern) => pattern.test(path))) {
    return { kind: "entry", path }
  }

  const [top = "", ...inside] = below

  if (inside.length === 0) {
    return { kind: "unmappedFile", path: posix.join(root, path) }
  }

  if (!Object.hasOwn(options.layers, top)) {
    return { folder: top, kind: "unmappedFolder", path: posix.join(root, top) }
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

const packages = new Map<string, string | undefined>()

function findPackage(dir: string): string | undefined {
  if (packages.has(dir)) {
    return packages.get(dir)
  }

  const parent = posix.dirname(dir)
  let found: string | undefined

  if (existsSync(posix.join(dir, "package.json"))) {
    found = dir
  } else if (parent !== dir) {
    found = findPackage(parent)
  }

  packages.set(dir, found)

  return found
}

const DEFAULT_CONDITIONS = ["types", "import", "node", "default"]

// TypeScript substitutes the source and declaration extensions for a runtime extension, such as
// `./view.tsx` for `./view.jsx`, and `tsconfig.json` `paths` resolve from the nearest config.
// oxc-resolver does not read `customConditions`, so they come from the `conditions` option. The
// resolver keeps symlinked paths as they are, so they compare with the paths that Oxlint lints.
const resolverOptions = {
  extensionAlias: {
    ".cjs": [".cts", ".d.cts", ".cjs"],
    ".js": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
    ".jsx": [".tsx", ".ts", ".d.ts", ".jsx", ".js"],
    ".mjs": [".mts", ".d.mts", ".mjs"],
  },
  extensions: [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
  symlinks: false,
  tsconfig: "auto",
} as const satisfies NapiResolveOptions

const baseResolver = new ResolverFactory({ ...resolverOptions, conditionNames: DEFAULT_CONDITIONS })

// One resolver for each set of conditions. Clones share the cache of the base resolver.
const resolvers = new Map<string, ResolverFactory>()

function getResolver(conditions: readonly string[]) {
  if (conditions.length === 0) {
    return baseResolver
  }

  const key = conditions.join("\0")
  let resolver = resolvers.get(key)

  if (resolver === undefined) {
    resolver = baseResolver.cloneWithOptions({
      ...resolverOptions,
      conditionNames: [...conditions, ...DEFAULT_CONDITIONS],
    })
    resolvers.set(key, resolver)
  }

  return resolver
}

// Oxlint caches the loaded plugin, so an editor language server needs a restart after a
// `package.json` or `tsconfig.json` changes.
const modules: Modules = {
  findPackage: (file) => findPackage(posix.dirname(file)),
  resolve: (importer, specifier, conditions) => {
    const { path } = getResolver(conditions).resolveFileSync(importer, specifier)

    return path === undefined ? undefined : toPosixPath(path)
  },
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
 * A linted file in a layer of one map, with what the rule needs to check its imports.
 */
interface LintedFile {
  readonly from: LayerLocation
  readonly importer: string
  readonly modules: Modules
  readonly options: LayersOptions
  readonly packageDir: string
  readonly root: string
}

/**
 * A linted file that one map reports as a whole: the map has errors, or the file is in no layer.
 */
interface ReportedFile {
  readonly errors: readonly MapError[]
  readonly from: Location
  readonly options: LayersOptions
}

function formatCycle(cycle: readonly string[]) {
  return cycle.map((name) => `\`${name}\``).join(" → ")
}

function reportFile(context: Context, node: ESTree.Program, file: ReportedFile) {
  const { errors, from } = file
  const root = file.options.rootGlob

  for (const error of errors) {
    if (error.kind === "cycle") {
      context.report({ data: { cycle: formatCycle(error.cycle), root }, messageId: "cycle", node })
    } else if (error.kind === "unknownImport") {
      context.report({
        data: { layer: error.layer, name: error.name, root },
        messageId: "unknownImport",
        node,
      })
    } else {
      context.report({ data: { name: error.name, root }, messageId: "unknownIsolate", node })
    }
  }

  if (from.kind === "unmappedFolder") {
    context.report({
      data: { folder: from.folder, path: from.path, root },
      messageId: "unmappedFolder",
      node,
    })
  } else if (from.kind === "unmappedFile") {
    context.report({ data: { path: from.path, root }, messageId: "unmappedFile", node })
  }
}

function checkImport(
  context: Context,
  file: LintedFile,
  source: ESTree.StringLiteral,
  typeOnly: boolean
) {
  const { from, options } = file
  const root = options.rootGlob

  if (typeOnly && options.ignoreTypes) {
    return
  }

  // An import that does not resolve is outside the map. TypeScript reports it.
  const target = file.modules.resolve(file.importer, source.value, options.conditions)
  const relative = target === undefined ? undefined : posix.relative(file.packageDir, target)

  // A dependency, or a file outside the package, is outside the map, even below a `.` root.
  const split =
    relative === undefined
    || relative.startsWith("../")
    || relative.split("/").includes("node_modules")
      ? undefined
      : splitAtRoot(options.root, relative)

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
      data: { from: describeLayer(from), root, to: to.path },
      messageId: "entry",
      node: source,
    })
  } else if (to.kind === "unmappedFolder") {
    context.report({
      data: { folder: to.folder, path: to.path, root },
      messageId: "unmappedFolder",
      node: source,
    })
  } else if (to.kind === "unmappedFile") {
    context.report({ data: { path: to.path, root }, messageId: "unmappedFile", node: source })
  } else if (violation === "isolated" || violation === "sibling" || violation === "upward") {
    const repair = describeRepairs(
      violation,
      findLowerRepairs(options.layers, from.layer, to.layer),
      findUpperRepairs(options.layers, from.layer, to.layer)
    )

    context.report({
      data: {
        from: describeLayer(from),
        layer: from.layer,
        repair,
        root,
        to: describeLayer(to),
      },
      messageId: violation,
      node: source,
    })
  }
}

export function createLayersRule(modules: Modules): Rule {
  return {
    create(context): Visitor {
      const importer = toPosixPath(context.filename)
      const packageDir = modules.findPackage(importer)

      if (packageDir === undefined) {
        return {}
      }

      const relative = posix.relative(packageDir, importer)
      const reported: ReportedFile[] = []
      const linted: LintedFile[] = []

      // Each map checks the file on its own, so a file below two roots meets both maps.
      for (const options of readLayersOptions(context.options)) {
        const split = splitAtRoot(options.root, relative)

        if (
          split !== undefined
          && !options.ignore.some((pattern) => pattern.test(split.below.join("/")))
        ) {
          const from = locate(options, split.root, split.below)
          const errors = findMapErrors(options.layers, options.isolate)

          if (errors.length > 0 || from.kind !== "layer") {
            reported.push({ errors, from, options })
          } else {
            linted.push({ from, importer, modules, options, packageDir, root: split.root })
          }
        }
      }

      if (reported.length === 0 && linted.length === 0) {
        return {}
      }

      function check(source: ESTree.StringLiteral, typeOnly: boolean) {
        for (const file of linted) {
          checkImport(context, file, source, typeOnly)
        }
      }

      return {
        ExportAllDeclaration(node) {
          check(node.source, node.exportKind === "type")
        },
        ExportNamedDeclaration(node) {
          if (node.source !== null) {
            check(node.source, isTypeOnlyExport(node))
          }
        },
        ImportDeclaration(node) {
          check(node.source, isTypeOnlyImport(node))
        },
        ImportExpression(node) {
          if (isStringLiteral(node.source)) {
            check(node.source, false)
          }
        },
        Program(node) {
          for (const file of reported) {
            reportFile(context, node, file)
          }
        },
        TSImportType(node) {
          check(node.source, true)
        },
      }
    },
    meta: {
      docs: {
        description:
          "Enforce one-way imports between the layers of a folder, from one or more layer maps in the rule options.",
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
      // Each option object is one layer map.
      schema: {
        items: {
          additionalProperties: false,
          properties: {
            conditions: { items: { type: "string" }, type: "array" },
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
        type: "array",
      },
      type: "problem",
    },
  }
}

const rule: Rule = createLayersRule(modules)

export default rule
