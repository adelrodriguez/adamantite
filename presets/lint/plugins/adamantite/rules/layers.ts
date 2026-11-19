import type { Context, ESTree, Options, Rule, Visitor } from "@oxlint/plugins"
import { existsSync } from "node:fs"
import { posix } from "node:path"
import type { Replacement } from "../../shared/replacement.d.ts"
import {
  readBooleanOption,
  readObjectOption,
  readStringArrayOption,
  readStringOption,
} from "../../shared/options.ts"
import { globToRegExp } from "../shared/glob.ts"
import {
  type ModuleSource,
  readDynamicSource,
  readImportEqualsSource,
  readRequireSource,
  readStaticSource,
} from "../shared/imports.ts"
import { identifyPath, type ResolutionMode, resolveImport } from "../shared/resolver.ts"

export type LayerMap = Readonly<Record<string, readonly string[]>>

export interface LayersOptions {
  readonly children: ReadonlyMap<string, LayersOptions>
  readonly configPath: string
  readonly conditions: readonly string[]
  readonly entries: readonly RegExp[]
  readonly ignore: readonly RegExp[]
  readonly ignoreTypes: boolean
  readonly isolate: ReadonlySet<string>
  readonly layers: LayerMap
  readonly root: RegExp
  readonly rootGlob: string
}

export interface Modules {
  readonly findPackage: (file: string) => string | undefined
  readonly identify: (path: string) => string
  readonly resolve: (
    importer: string,
    specifier: string,
    mode: ResolutionMode,
    conditions: readonly string[]
  ) => string | undefined
}

export type Location =
  | { readonly kind: "entry"; readonly path: string }
  | { readonly kind: "layer"; readonly layer: string; readonly unit: string | undefined }
  | { readonly kind: "unmappedFile"; readonly path: string }
  | { readonly kind: "unmappedFolder"; readonly folder: string; readonly path: string }

type LayerLocation = Extract<Location, { kind: "layer" }>

type UnmappedLocation = Extract<Location, { kind: "unmappedFile" | "unmappedFolder" }>

type Violation = "isolated" | "sibling" | "upward"

export type MapError =
  | { readonly kind: "cycle"; readonly cycle: readonly string[] }
  | { readonly kind: "unknownImport"; readonly layer: string; readonly name: string }
  | { readonly kind: "unknownIsolate"; readonly name: string }

const LAYER_MAP_HINT =
  "Layer map: the `adamantite/layers` options for root `{{root}}` in the Oxlint config at `{{configPath}}`."

function toPosixPath(path: string) {
  return path.replaceAll("\\", "/")
}

function readLayerMap(
  option: Options[number],
  root: string | undefined,
  configPath: string
): LayersOptions | undefined {
  // Oxlint validates the recursive schema before it calls the rule.
  const options = [option]
  const declarations = readObjectOption(options, "layers")

  if (root === undefined || declarations === undefined) {
    return undefined
  }

  const layers: Array<[string, readonly string[]]> = []
  const children = new Map<string, LayersOptions>()

  for (const [name, declaration] of Object.entries(declarations)) {
    const imports = readStringArrayOption([declaration], "imports")

    if (imports === undefined) {
      return undefined
    }

    layers.push([name, imports])

    const child = readLayerMap(declaration, posix.join(root, name), `${configPath}.${name}.layers`)

    if (child !== undefined) {
      children.set(name, child)
    }
  }

  return {
    children,
    conditions: readStringArrayOption(options, "conditions") ?? [],
    configPath,
    entries: (readStringArrayOption(options, "entries") ?? []).map((glob) => globToRegExp(glob)),
    ignore: (readStringArrayOption(options, "ignore") ?? []).map((glob) => globToRegExp(glob)),
    ignoreTypes: readBooleanOption(options, "ignoreTypes") ?? false,
    isolate: new Set(readStringArrayOption(options, "isolate")),
    layers: Object.fromEntries(layers),
    root: globToRegExp(
      root
        .split("/")
        .filter((segment) => segment !== "" && segment !== ".")
        .join("/")
    ),
    rootGlob: root,
  }
}

export function readLayersOptions(options: Readonly<Options>): LayersOptions[] {
  return options.flatMap(
    (option, index) =>
      readLayerMap(option, readStringOption([option], "root"), `options[${index}].layers`) ?? []
  )
}

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

export function splitAtRoot(
  root: RegExp,
  relative: string
): { readonly below: readonly string[]; readonly root: string } | undefined {
  const segments = relative.split("/")

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

export function findViolation(
  layers: LayerMap,
  from: LayerLocation,
  to: LayerLocation
): Violation | undefined {
  if (from.layer === to.layer) {
    return from.unit === to.unit ? undefined : "isolated"
  }

  if (listImportable(layers, from.layer).has(to.layer)) {
    return undefined
  }

  return listImportable(layers, to.layer).has(from.layer) ? "upward" : "sibling"
}

function keepHighest(layers: LayerMap, names: readonly string[]) {
  return names.filter(
    (name) => !names.some((other) => other !== name && listImportable(layers, other).has(name))
  )
}

function keepLowest(layers: LayerMap, names: readonly string[]) {
  return names.filter(
    (name) => !names.some((other) => other !== name && listImportable(layers, name).has(other))
  )
}

export function findLowerRepairs(layers: LayerMap, from: string, to: string): string[] {
  const fromImportable = listImportable(layers, from)
  const toImportable = listImportable(layers, to)

  const common = Object.keys(layers).filter(
    (name) => fromImportable.has(name) && toImportable.has(name) && (from !== to || name !== from)
  )

  return keepHighest(layers, common)
}

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

const REPAIR_WORDS = {
  isolated: { lower: "both need", upper: "compose them in" },
  sibling: { lower: "both need", upper: "move this file up to" },
  upward: { lower: "this file needs", upper: "move this file up to" },
} as const satisfies Record<Violation, { readonly lower: string; readonly upper: string }>

export function describeRepairs(
  violation: Violation,
  lower: readonly string[],
  upper: readonly string[]
): string {
  const words = REPAIR_WORDS[violation]

  const parts = [
    ...(lower.length > 0 ? [`move the code that ${words.lower} down to ${formatList(lower)}`] : []),
    ...(upper.length > 0 ? [`${words.upper} ${formatList(upper)}`] : []),
  ]

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

const modules: Modules = {
  findPackage: (file) => findPackage(posix.dirname(file)),
  identify: identifyPath,
  resolve: resolveImport,
}

const MAP_PROPERTIES = {
  conditions: { items: { type: "string" }, type: "array" },
  entries: { items: { type: "string" }, type: "array" },
  ignore: { items: { type: "string" }, type: "array" },
  ignoreTypes: { type: "boolean" },
  isolate: { items: { type: "string" }, type: "array" },
  layers: { additionalProperties: { $ref: "#/definitions/layer" }, type: "object" },
} as const

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

interface LintedFile {
  readonly from: LayerLocation
  readonly importer: string
  readonly modules: Modules
  readonly options: LayersOptions
  readonly packageDir: string
  readonly root: string
}

interface ReportedFile {
  readonly errors: readonly MapError[]
  readonly from: Location
  readonly options: LayersOptions
  readonly root: string
}

function formatCycle(cycle: readonly string[]) {
  return cycle.map((name) => `\`${name}\``).join(" → ")
}

function reportUnmapped(
  context: Context,
  node: ESTree.Node,
  location: UnmappedLocation,
  root: string,
  configPath: string
) {
  if (location.kind === "unmappedFolder") {
    context.report({
      data: { configPath, folder: location.folder, path: location.path, root },
      messageId: "unmappedFolder",
      node,
    })
  } else {
    context.report({
      data: { configPath, path: location.path, root },
      messageId: "unmappedFile",
      node,
    })
  }
}

function getMapErrorData(error: MapError) {
  switch (error.kind) {
    case "cycle":
      return { cycle: formatCycle(error.cycle) }
    case "unknownImport":
      return { layer: error.layer, name: error.name }
    case "unknownIsolate":
      return { name: error.name }
  }
}

function reportFile(context: Context, node: ESTree.Program, file: ReportedFile) {
  const { errors, from } = file
  const root = file.root || "."
  const { configPath } = file.options

  for (const error of errors) {
    context.report({
      data: { configPath, root, ...getMapErrorData(error) },
      messageId: error.kind,
      node,
    })
  }

  if (from.kind === "unmappedFile" || from.kind === "unmappedFolder") {
    reportUnmapped(context, node, from, root, configPath)
  }
}

function isOutsidePackage(relative: string) {
  return (
    relative === ".." || relative.startsWith("../") || relative.split("/").includes("node_modules")
  )
}

function checkImport(context: Context, file: LintedFile, source: ModuleSource, typeOnly: boolean) {
  const { from, options } = file
  const root = file.root || "."

  if (typeOnly && options.ignoreTypes) {
    return
  }

  const target = file.modules.resolve(
    file.importer,
    source.specifier,
    source.mode,
    options.conditions
  )

  const relative =
    target === undefined
      ? undefined
      : posix.relative(
          file.modules.identify(posix.join(file.packageDir, file.root)),
          file.modules.identify(target)
        )

  if (relative === undefined || isOutsidePackage(relative)) {
    return
  }

  const to = locate(options, file.root, relative.split("/"))

  if (to.kind === "entry") {
    context.report({
      data: { configPath: options.configPath, from: describeLayer(from), root, to: to.path },
      messageId: "entry",
      node: source.node,
    })

    return
  }

  if (to.kind !== "layer") {
    reportUnmapped(context, source.node, to, root, options.configPath)

    return
  }

  const violation = findViolation(options.layers, from, to)

  if (violation === undefined) {
    return
  }

  context.report({
    data: {
      configPath: options.configPath,
      from: describeLayer(from),
      layer: from.layer,
      repair: describeRepairs(
        violation,
        findLowerRepairs(options.layers, from.layer, to.layer),
        findUpperRepairs(options.layers, from.layer, to.layer)
      ),
      root,
      to: describeLayer(to),
    },
    messageId: violation,
    node: source.node,
  })
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

      const active: Array<{
        readonly options: LayersOptions
        readonly root: string
        readonly below: readonly string[]
      }> = []

      function activate(options: LayersOptions, root: string, below: readonly string[]) {
        active.push({ below, options, root })

        const [folder = "", ...inside] = below
        const child = options.children.get(folder)

        if (child !== undefined && inside.length > 0) {
          activate(child, posix.join(root, folder), inside)
        }
      }

      for (const options of readLayersOptions(context.options)) {
        const split = splitAtRoot(options.root, relative)

        if (split !== undefined) {
          activate(options, split.root, split.below)
        }
      }

      const declarations = new Map<string, string[]>()

      for (const { options, root } of active) {
        declarations.set(root, [...(declarations.get(root) ?? []), options.configPath])
      }

      const duplicates = [...declarations].filter(([, paths]) => paths.length > 1)
      const duplicateRoots = new Set(duplicates.map(([root]) => root))

      for (const { below, options, root } of active) {
        if (
          duplicateRoots.has(root)
          || options.ignore.some((pattern) => pattern.test(below.join("/")))
        ) {
          continue
        }

        const from = locate(options, root, below)
        const errors = findMapErrors(options.layers, options.isolate)

        if (errors.length > 0 || from.kind !== "layer") {
          reported.push({ errors, from, options, root })
        } else {
          linted.push({ from, importer, modules, options, packageDir, root })
        }
      }

      if (reported.length === 0 && linted.length === 0 && duplicates.length === 0) {
        return {}
      }

      function check(source: ModuleSource, typeOnly: boolean) {
        for (const file of linted) {
          checkImport(context, file, source, typeOnly)
        }
      }

      return {
        CallExpression(node) {
          const source = readRequireSource(context, node)

          if (source !== undefined) {
            check(source, false)
          }
        },
        ExportAllDeclaration(node) {
          check(readStaticSource(node.source), node.exportKind === "type")
        },
        ExportNamedDeclaration(node) {
          if (node.source !== null) {
            check(readStaticSource(node.source), isTypeOnlyExport(node))
          }
        },
        ImportDeclaration(node) {
          check(readStaticSource(node.source), isTypeOnlyImport(node))
        },
        ImportExpression(node) {
          const source = readDynamicSource(node)

          if (source !== undefined) {
            check(source, false)
          }
        },
        Program(node) {
          for (const [root, paths] of duplicates) {
            context.report({
              data: {
                declarations: paths.map((path) => `\`${path}\``).join(" and "),
                root: root || ".",
              },
              messageId: "duplicateMap",
              node,
            })
          }

          for (const file of reported) {
            reportFile(context, node, file)
          }
        },
        TSImportEqualsDeclaration(node) {
          const source = readImportEqualsSource(node)

          if (source !== undefined) {
            check(source, node.importKind === "type")
          }
        },
        TSImportType(node) {
          check(readStaticSource(node.source), true)
        },
      }
    },
    meta: {
      docs: {
        description:
          "Enforce one-way imports between the layers of a folder, from one or more layer maps in the rule options.",
        // Oxlint replaces the options that an earlier override set for the same files, so a layer
        // map by hand repeats the patterns of each earlier override.
        replaces: {
          kind: "overrides",
          minimum: 2,
          option: "patterns",
          rules: [
            "no-restricted-imports",
            "eslint/no-restricted-imports",
            "typescript/no-restricted-imports",
          ],
          states: "import layers",
          steps: [
            "State each root as a layer map in `adamantite/layers`.",
            "Use `ignore` in place of an override that turns the rule off for tests, `entries` in place of a ban on imports of entry files, and `isolate` in place of a ban on imports between the units of one layer.",
            "Remove each override that a layer map replaces. Keep each override that a layer map cannot state, such as a ban on imports from another workspace package, because a layer map checks only the imports inside one package.",
          ],
        } satisfies Replacement,
      },
      messages: {
        cycle: `The layer map has a cycle: {{cycle}}. Layers import in one direction. ${LAYER_MAP_HINT}`,
        duplicateMap:
          "Root `{{root}}` has more than one layer map: {{declarations}}. Keep one declaration for this scope.",
        entry: `\`{{from}}\` cannot import the entry \`{{to}}\`: no layer imports an entry. Move the code that it needs into a layer. ${LAYER_MAP_HINT}`,
        isolated: `\`{{from}}\` cannot import \`{{to}}\`: units in \`{{layer}}\` do not import each other.{{repair}} ${LAYER_MAP_HINT}`,
        sibling: `\`{{from}}\` cannot import \`{{to}}\`: they are siblings.{{repair}} ${LAYER_MAP_HINT}`,
        unknownImport: `\`{{layer}}\` imports \`{{name}}\`, which is not a layer. ${LAYER_MAP_HINT}`,
        unknownIsolate: `\`isolate\` lists \`{{name}}\`, which is not a layer. ${LAYER_MAP_HINT}`,
        unmappedFile: `\`{{path}}\` is in no layer. Move it into a layer folder, or list it in \`entries\`. ${LAYER_MAP_HINT}`,
        unmappedFolder: `\`{{path}}\` is in no layer. Add \`{{folder}}\` to the layer map, with the layers that it imports. ${LAYER_MAP_HINT}`,
        upward: `\`{{from}}\` cannot import \`{{to}}\`: it is a higher layer.{{repair}} ${LAYER_MAP_HINT}`,
      },
      schema: {
        definitions: {
          layer: {
            oneOf: [
              {
                additionalProperties: false,
                properties: { imports: { items: { type: "string" }, type: "array" } },
                required: ["imports"],
                type: "object",
              },
              {
                additionalProperties: false,
                properties: {
                  ...MAP_PROPERTIES,
                  imports: { items: { type: "string" }, type: "array" },
                },
                required: ["imports", "layers"],
                type: "object",
              },
            ],
          },
        },
        items: {
          additionalProperties: false,
          properties: {
            ...MAP_PROPERTIES,
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
