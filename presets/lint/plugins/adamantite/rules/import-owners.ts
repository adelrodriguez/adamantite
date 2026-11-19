import type { ESTree, Options, Rule, Visitor } from "@oxlint/plugins"
import { existsSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import { readStringArrayOption, readStringOption } from "../../shared/options.ts"
import { globToRegExp } from "../shared/glob.ts"
import {
  type ModuleSource,
  readDynamicSource,
  readImportEqualsSource,
  readRequireSource,
  readStaticSource,
} from "../shared/imports.ts"
import { identifyPath, type ResolutionMode, resolveImport } from "../shared/resolver.ts"

export interface ImportOwner {
  readonly configPath: string
  readonly import: string
  readonly kind: ModuleKind
  readonly names: ReadonlySet<string> | undefined
  readonly owners: readonly string[]
  readonly patterns: readonly RegExp[]
}

export type ModuleKind = "alias" | "package" | "path"

const MODULE_MATCHES = {
  alias: { file: true, text: true },
  package: { file: false, text: true },
  path: { file: true, text: false },
} as const satisfies Record<ModuleKind, { readonly file: boolean; readonly text: boolean }>

function readModuleKind(specifier: string): ModuleKind {
  if (specifier.startsWith("#")) {
    return "alias"
  }

  return /^[./]/.test(specifier) ? "path" : "package"
}

export interface Root {
  readonly kind: "package" | "workspace"
  readonly path: string
}

const ROOT_NAMES = {
  package: "package root",
  workspace: "workspace root",
} as const satisfies Record<Root["kind"], string>

export interface Project {
  readonly findRoot: (file: string) => Root | undefined
  readonly identify: (path: string) => string
  readonly resolve: (
    importer: string,
    specifier: string,
    mode: ResolutionMode
  ) => string | undefined
}

const OWNERS_HINT =
  "Owners: the `adamantite/import-owners` options in the Oxlint config at `{{configPath}}`. Owner paths are relative to the {{root}}."

function toPosixPath(path: string) {
  return path.replaceAll("\\", "/")
}

function normalizeOwner(owner: string) {
  return owner
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/")
}

function readImportOwner(option: Options[number], configPath: string): ImportOwner | undefined {
  const options = [option]
  const specifier = readStringOption(options, "import")
  const owners = readStringArrayOption(options, "owners")
  const names = readStringArrayOption(options, "names")

  if (specifier === undefined || owners === undefined) {
    return undefined
  }

  return {
    configPath,
    import: specifier,
    kind: readModuleKind(specifier),
    names: names === undefined ? undefined : new Set(names),
    owners,
    patterns: owners.flatMap((owner) => [
      globToRegExp(normalizeOwner(owner)),
      globToRegExp(`${normalizeOwner(owner)}/**`),
    ]),
  }
}

export function readImportOwners(options: Readonly<Options>): ImportOwner[] {
  return options.flatMap((option, index) => readImportOwner(option, `options[${index}]`) ?? [])
}

export function isImportOf(module: string, specifier: string): boolean {
  return specifier === module || specifier.startsWith(`${module}/`)
}

function formatList(names: readonly string[]) {
  const quoted = names.map((name) => `\`${name}\``)

  if (quoted.length <= 2) {
    return quoted.join(" or ")
  }

  return `${quoted.slice(0, -1).join(", ")}, or ${quoted.at(-1) ?? ""}`
}

function getExportName(name: ESTree.ModuleExportName) {
  return name.type === "Literal" ? name.value : name.name
}

function hasWorkspacesField(packageJson: string) {
  try {
    const manifest: unknown = JSON.parse(readFileSync(packageJson, "utf8"))

    return manifest instanceof Object && Object.hasOwn(manifest, "workspaces")
  } catch {
    return false
  }
}

// A `pnpm-workspace.yaml` without a `packages` key only holds settings.
function listsWorkspacePackages(dir: string) {
  const pnpmWorkspace = posix.join(dir, "pnpm-workspace.yaml")

  if (existsSync(pnpmWorkspace) && /^packages\s*:/m.test(readFileSync(pnpmWorkspace, "utf8"))) {
    return true
  }

  const packageJson = posix.join(dir, "package.json")

  return existsSync(packageJson) && hasWorkspacesField(packageJson)
}

const workspaces = new Map<string, string | undefined>()

function findWorkspace(dir: string): string | undefined {
  if (workspaces.has(dir)) {
    return workspaces.get(dir)
  }

  const parent = posix.dirname(dir)
  let found: string | undefined

  if (listsWorkspacePackages(dir)) {
    found = dir
  } else if (parent !== dir) {
    found = findWorkspace(parent)
  }

  workspaces.set(dir, found)

  return found
}

function findPackage(dir: string): string | undefined {
  if (existsSync(posix.join(dir, "package.json"))) {
    return dir
  }

  const parent = posix.dirname(dir)

  return parent === dir ? undefined : findPackage(parent)
}

function findRoot(file: string): Root | undefined {
  const workspace = findWorkspace(posix.dirname(file))

  if (workspace !== undefined) {
    return { kind: "workspace", path: workspace }
  }

  const found = findPackage(posix.dirname(file))

  return found === undefined ? undefined : { kind: "package", path: found }
}

const project: Project = { findRoot, identify: identifyPath, resolve: resolveImport }

function listAliasNames(path: string) {
  const bareNames = [path.replace(/\.[^./]+$/, ""), path.replace(/\.d\.[^./]+$/, "")]

  const folders = bareNames.flatMap((name) =>
    posix.basename(name) === "index" ? [posix.dirname(name)] : []
  )

  return [...new Set([path, ...bareNames, ...folders])].filter((name) => name !== ".")
}

export function createImportOwnersRule(project: Project): Rule {
  // Oxlint loads the rule one time for a lint run, so the answers carry over between files.
  const coverage = new Map<string, boolean>()

  function covers(entry: ImportOwner, root: string, path: string, mode: ResolutionMode) {
    const key = [entry.import, root, path, mode].join("\0")
    const known = coverage.get(key)

    if (known !== undefined) {
      return known
    }

    const anchor = posix.join(root, "package.json")
    const file = project.identify(path)

    const tails = new Set(
      [posix.relative(root, path), posix.relative(project.identify(root), file)].flatMap(
        (relative) => {
          const segments = relative.split("/")

          return segments.flatMap((_, index) => listAliasNames(segments.slice(index).join("/")))
        }
      )
    )

    function reaches(specifier: string) {
      const resolved = project.resolve(anchor, specifier, mode)

      return resolved !== undefined && project.identify(resolved) === file
    }

    const result =
      reaches(entry.import) || [...tails].some((tail) => reaches(`${entry.import}/${tail}`))

    coverage.set(key, result)

    return result
  }

  return {
    create(context): Visitor {
      const importer = toPosixPath(context.filename)
      const root = project.findRoot(importer)

      if (root === undefined) {
        return {}
      }

      const projectRoot = root.path
      const relative = posix.relative(projectRoot, importer)
      const rootName = ROOT_NAMES[root.kind]

      const restricted = readImportOwners(context.options).filter(
        (entry) => !entry.patterns.some((pattern) => pattern.test(relative))
      )

      if (restricted.length === 0) {
        return {}
      }

      function describeEntry(entry: ImportOwner) {
        return {
          configPath: entry.configPath,
          import: entry.import,
          owners: formatList(entry.owners),
          root: rootName,
        }
      }

      function reportModule(entry: ImportOwner, node: ESTree.Node) {
        context.report({
          data: describeEntry(entry),
          messageId: "module",
          node,
        })
      }

      function reportName(entry: ImportOwner, node: ESTree.Node, name: string) {
        context.report({
          data: { ...describeEntry(entry), name },
          messageId: "name",
          node,
        })
      }

      function reportNamespace(entry: ImportOwner, node: ESTree.Node, names: ReadonlySet<string>) {
        context.report({
          data: { ...describeEntry(entry), names: formatList([...names]) },
          messageId: "namespace",
          node,
        })
      }

      const matchesFile = restricted.some((entry) => MODULE_MATCHES[entry.kind].file)

      function findRestricted(source: ModuleSource) {
        const resolved = matchesFile
          ? project.resolve(importer, source.specifier, source.mode)
          : undefined

        const path = resolved?.includes("/node_modules/") === false ? resolved : undefined

        return restricted.filter((entry) => {
          const matches = MODULE_MATCHES[entry.kind]

          return (
            (matches.text && isImportOf(entry.import, source.specifier))
            || (matches.file && path !== undefined && covers(entry, projectRoot, path, source.mode))
          )
        })
      }

      // A plain `export * from` reaches every export except the default export.
      function checkWhole(source: ModuleSource, withDefault = true) {
        for (const entry of findRestricted(source)) {
          if (entry.names === undefined) {
            reportModule(entry, source.node)
            continue
          }

          const reached = new Set(
            [...entry.names].filter((name) => withDefault || name !== "default")
          )

          if (reached.size > 0) {
            reportNamespace(entry, source.node, reached)
          }
        }
      }

      // A type import with a qualifier, such as `import("react-native").Alert.Props`, reaches only
      // the export `Alert`.
      function checkImportType(node: ESTree.TSImportType) {
        if (node.qualifier === null) {
          checkWhole(readStaticSource(node.source))

          return
        }

        let first = node.qualifier

        while (first.type === "TSQualifiedName") {
          first = first.left
        }

        for (const entry of findRestricted(readStaticSource(node.source))) {
          if (entry.names === undefined) {
            reportModule(entry, node.source)
          } else if (entry.names.has(first.name)) {
            reportName(entry, node.qualifier, first.name)
          }
        }
      }

      function checkImport(node: ESTree.ImportDeclaration) {
        for (const entry of findRestricted(readStaticSource(node.source))) {
          const { names } = entry

          if (names === undefined) {
            reportModule(entry, node.source)
            continue
          }

          for (const specifier of node.specifiers) {
            if (specifier.type === "ImportNamespaceSpecifier") {
              reportNamespace(entry, specifier, names)
            } else if (specifier.type === "ImportDefaultSpecifier") {
              if (names.has("default")) {
                reportName(entry, specifier, "default")
              }
            } else if (names.has(getExportName(specifier.imported))) {
              reportName(entry, specifier, getExportName(specifier.imported))
            }
          }
        }
      }

      function checkExport(node: ESTree.ExportNamedDeclaration, source: ESTree.StringLiteral) {
        for (const entry of findRestricted(readStaticSource(source))) {
          const { names } = entry

          if (names === undefined) {
            reportModule(entry, source)
            continue
          }

          for (const specifier of node.specifiers) {
            if (names.has(getExportName(specifier.local))) {
              reportName(entry, specifier, getExportName(specifier.local))
            }
          }
        }
      }

      return {
        CallExpression(node) {
          const source = readRequireSource(context, node)

          if (source !== undefined) {
            checkWhole(source)
          }
        },
        ExportAllDeclaration(node) {
          checkWhole(readStaticSource(node.source), node.exported !== null)
        },
        ExportNamedDeclaration(node) {
          if (node.source !== null) {
            checkExport(node, node.source)
          }
        },
        ImportDeclaration: checkImport,
        ImportExpression(node) {
          const source = readDynamicSource(node)

          if (source !== undefined) {
            checkWhole(source)
          }
        },
        TSImportEqualsDeclaration(node) {
          const source = readImportEqualsSource(node)

          if (source !== undefined) {
            checkWhole(source)
          }
        },
        TSImportType: checkImportType,
      }
    },
    meta: {
      docs: {
        description:
          "Restrict an import to the files and folders that own it, from the owners in the rule options.",
      },
      messages: {
        module: `Only {{owners}} may import \`{{import}}\`. Use what the owner exports, or move this code into the owner. ${OWNERS_HINT}`,
        name: `Only {{owners}} may import \`{{name}}\` from \`{{import}}\`. Use what the owner exports, or move this code into the owner. ${OWNERS_HINT}`,
        namespace: `This import reaches {{names}} from \`{{import}}\`, which only {{owners}} may import. Import only the names that this file needs. ${OWNERS_HINT}`,
      },
      schema: {
        items: {
          additionalProperties: false,
          properties: {
            import: { minLength: 1, type: "string" },
            names: { items: { type: "string" }, minItems: 1, type: "array" },
            owners: { items: { minLength: 1, type: "string" }, minItems: 1, type: "array" },
          },
          required: ["import", "owners"],
          type: "object",
        },
        type: "array",
      },
      type: "problem",
    },
  }
}

const rule: Rule = createImportOwnersRule(project)

export default rule
