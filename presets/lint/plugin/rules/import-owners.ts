import type { ESTree, Options, Rule, Visitor } from "@oxlint/plugins"
import { existsSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import { globToRegExp } from "../glob.ts"
import { isStringLiteral } from "../imports.ts"
import { readStringArrayOption, readStringOption } from "../options.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs: Node.js built-ins that Bun also provides.

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
 * What the rule reads from the file system. The plugin reads real files, and unit tests pass fakes.
 */
export interface Project {
  /**
   * The folder that owner paths are relative to: the root of the workspace that holds `file`, or
   * the nearest folder above `file` that holds a `package.json` when no workspace holds it.
   */
  readonly findRoot: (file: string) => string | undefined
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
}

export function createImportOwnersRule(project: Project): Rule {
  return {
    create(context): Visitor {
      const importer = toPosixPath(context.filename)
      const root = project.findRoot(importer)

      if (root === undefined) {
        return {}
      }

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

      function findRestricted(source: ESTree.StringLiteral) {
        return restricted.filter((entry) => isImportOf(entry.import, source.value))
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
        module: `Only {{owners}} imports \`{{import}}\`. Use what the owner exports, or move this code into the owner. ${OWNERS_HINT}`,
        name: `Only {{owners}} imports \`{{name}}\` from \`{{import}}\`. Use what the owner exports, or move this code into the owner. ${OWNERS_HINT}`,
        namespace: `This import reaches {{names}} from \`{{import}}\`, which only {{owners}} imports. Import only the names that this file needs. ${OWNERS_HINT}`,
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
