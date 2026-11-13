import type { ESTree, Options, Rule, Visitor } from "@oxlint/plugins"
import { existsSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import { isStringLiteral } from "../shared/ast.ts"
import { globToRegExp } from "../shared/glob.ts"
import { readStringArrayOption, readStringOption } from "../shared/options.ts"
import { resolveImport } from "../shared/resolver.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs: Node.js built-ins that Bun also provides, and oxc-resolver.

/**
 * One import and its owners: one option object of the rule.
 */
export interface ImportOwner {
  /**
   * The module as the import states it, such as `giget`. It also covers the module's subpaths, such
   * as `zod/mini` for `zod`.
   */
  readonly import: string
  /**
   * How the option names the module, which sets how the rule matches an import of it.
   */
  readonly kind: ModuleKind
  /**
   * The exports that the owners own. Undefined when they own the whole module.
   */
  readonly names: ReadonlySet<string> | undefined
  /**
   * The owner files and folders as the option states them, which messages name.
   */
  readonly owners: readonly string[]
  /**
   * A pattern for each owner that matches the owner file, or each file below the owner folder.
   */
  readonly patterns: readonly RegExp[]
}

/**
 * How an option names its module, by the start of `import`:
 *
 * - `package`, such as `giget`: the rule matches the import as written.
 * - `alias`, such as `#lib/db`: a module of the project. The rule matches the import as written, and
 *   also any import that resolves to the module, such as a relative path. The alias resolves from
 *   the root, so the text match keeps an alias that a workspace package declares.
 * - `path`, such as `./src/lib/db` or `/src/lib/db`: a module of the project that the rule matches
 *   only by the resolved file, because the text of a relative import depends on its file.
 */
export type ModuleKind = "alias" | "package" | "path"

/**
 * Whether an import of each kind of module matches by its text, and by its resolved file.
 */
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

/**
 * What the rule reads from the file system. The plugin reads real files, and unit tests pass fakes.
 */
export interface Project {
  /**
   * The folder that owner paths are relative to: the root of the workspace that holds `file`, or
   * the nearest folder above `file` that holds a `package.json` when no workspace holds it.
   */
  readonly findRoot: (file: string) => string | undefined
  /**
   * The file that `specifier` in `importer` resolves to, with `/` between folders, or undefined
   * when it does not resolve.
   */
  readonly resolve: (importer: string, specifier: string) => string | undefined
}

const OWNERS_HINT = "Owners: the `adamantite/import-owners` options in the Oxlint config."

function toPosixPath(path: string) {
  return path.replaceAll("\\", "/")
}

function normalizeOwner(owner: string) {
  return owner
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/")
}

/**
 * Read one import and its owners from one option object. Undefined when `import` or `owners` is
 * missing.
 */
function readImportOwner(option: Options[number]): ImportOwner | undefined {
  // The option readers read the first option object.
  const options = [option]
  const specifier = readStringOption(options, "import")
  const owners = readStringArrayOption(options, "owners")
  const names = readStringArrayOption(options, "names")

  if (specifier === undefined || owners === undefined) {
    return undefined
  }

  return {
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

/**
 * Read the rule options: one import and its owners for each option object. An object without
 * `import` or `owners` is left out.
 */
export function readImportOwners(options: Readonly<Options>): ImportOwner[] {
  return options.flatMap((option) => readImportOwner(option) ?? [])
}

/**
 * Whether `specifier` imports `module` or one of its subpaths.
 */
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
    // The package manager reports a broken `package.json`.
    return false
  }
}

/**
 * Whether `dir` lists workspace packages. A `pnpm-workspace.yaml` without a `packages` key only
 * holds settings.
 */
function listsWorkspacePackages(dir: string) {
  const pnpmWorkspace = posix.join(dir, "pnpm-workspace.yaml")

  if (existsSync(pnpmWorkspace) && /^packages\s*:/m.test(readFileSync(pnpmWorkspace, "utf8"))) {
    return true
  }

  const packageJson = posix.join(dir, "package.json")

  return existsSync(packageJson) && hasWorkspacesField(packageJson)
}

const workspaces = new Map<string, string | undefined>()

/**
 * The nearest folder at or above `dir` that lists workspace packages, in `pnpm-workspace.yaml` or
 * in the `workspaces` field of `package.json`.
 */
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

const project: Project = {
  findRoot: (file) => findWorkspace(posix.dirname(file)) ?? findPackage(posix.dirname(file)),
  resolve: resolveImport,
}

/**
 * The names that an alias can give the file at `path`: the path itself, the path without its
 * extension for an alias such as `"#lib/*": "./src/lib/*.ts"`, and the folder of an index file for
 * an alias that adds `/index.ts` after the name. A declaration file such as `rows.d.ts` has two
 * names without its extension: `rows.d` for an alias that adds `.ts`, and `rows` for an alias that
 * adds `.d.ts`.
 */
function listAliasNames(path: string) {
  const bareNames = [path.replace(/\.[^./]+$/, ""), path.replace(/\.d\.[^./]+$/, "")]

  const folders = bareNames.flatMap((name) =>
    posix.basename(name) === "index" ? [posix.dirname(name)] : []
  )

  return [...new Set([path, ...bareNames, ...folders])].filter((name) => name !== ".")
}

export function createImportOwnersRule(project: Project): Rule {
  // Whether a project module covers a resolved file, by module, root, and file. Oxlint loads the
  // rule one time for a lint run, so the answers carry over between files.
  const coverage = new Map<string, boolean>()

  /**
   * Whether `file` is the project module `entry.import`, or a file below it when the module is a
   * folder. The module resolves from the root, as owner paths do. A folder resolves only through a
   * file in it, so each tail of the file's path is tried below the module, in each name that an
   * alias can give it.
   */
  function covers(entry: ImportOwner, root: string, file: string) {
    const key = [entry.import, root, file].join("\0")
    const known = coverage.get(key)

    if (known !== undefined) {
      return known
    }

    const anchor = posix.join(root, "package.json")
    const segments = posix.relative(root, file).split("/")
    const tails = segments.flatMap((_, index) => listAliasNames(segments.slice(index).join("/")))

    const result =
      project.resolve(anchor, entry.import) === file
      || tails.some((tail) => project.resolve(anchor, `${entry.import}/${tail}`) === file)

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

      // The closures below keep the narrowed root.
      const projectRoot = root
      const relative = posix.relative(root, importer)

      const restricted = readImportOwners(context.options).filter(
        (entry) => !entry.patterns.some((pattern) => pattern.test(relative))
      )

      if (restricted.length === 0) {
        return {}
      }

      function reportModule(entry: ImportOwner, node: ESTree.Node) {
        context.report({
          data: { import: entry.import, owners: formatList(entry.owners) },
          messageId: "module",
          node,
        })
      }

      function reportName(entry: ImportOwner, node: ESTree.Node, name: string) {
        context.report({
          data: { import: entry.import, name, owners: formatList(entry.owners) },
          messageId: "name",
          node,
        })
      }

      function reportNamespace(entry: ImportOwner, node: ESTree.Node, names: ReadonlySet<string>) {
        context.report({
          data: {
            import: entry.import,
            names: formatList([...names]),
            owners: formatList(entry.owners),
          },
          messageId: "namespace",
          node,
        })
      }

      const matchesFile = restricted.some((entry) => MODULE_MATCHES[entry.kind].file)

      function findRestricted(source: ESTree.StringLiteral) {
        // A project module can match only an import that resolves to a file of the project.
        const resolved = matchesFile ? project.resolve(importer, source.value) : undefined
        const file = resolved?.includes("/node_modules/") === false ? resolved : undefined

        return restricted.filter((entry) => {
          const matches = MODULE_MATCHES[entry.kind]

          return (
            (matches.text && isImportOf(entry.import, source.value))
            || (matches.file && file !== undefined && covers(entry, projectRoot, file))
          )
        })
      }

      /**
       * Check an import that reaches every export of the module, such as `import()`. A plain
       * `export * from` reaches every export except the default export.
       */
      function checkWhole(source: ESTree.StringLiteral, withDefault = true) {
        for (const entry of findRestricted(source)) {
          if (entry.names === undefined) {
            reportModule(entry, source)
            continue
          }

          const reached = new Set(
            [...entry.names].filter((name) => withDefault || name !== "default")
          )

          if (reached.size > 0) {
            reportNamespace(entry, source, reached)
          }
        }
      }

      /**
       * Check a type import, such as `import("react-native").Alert`. With a qualifier it reaches
       * only the export that the qualifier names first.
       */
      function checkImportType(node: ESTree.TSImportType) {
        if (node.qualifier === null) {
          checkWhole(node.source)

          return
        }

        let first = node.qualifier

        while (first.type === "TSQualifiedName") {
          first = first.left
        }

        for (const entry of findRestricted(node.source)) {
          if (entry.names === undefined) {
            reportModule(entry, node.source)
          } else if (entry.names.has(first.name)) {
            reportName(entry, node.qualifier, first.name)
          }
        }
      }

      function checkImport(node: ESTree.ImportDeclaration) {
        for (const entry of findRestricted(node.source)) {
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
        for (const entry of findRestricted(source)) {
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
        ExportAllDeclaration(node) {
          checkWhole(node.source, node.exported !== null)
        },
        ExportNamedDeclaration(node) {
          if (node.source !== null) {
            checkExport(node, node.source)
          }
        },
        ImportDeclaration: checkImport,
        ImportExpression(node) {
          if (isStringLiteral(node.source)) {
            checkWhole(node.source)
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
      // Each option object is one import and its owners.
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
