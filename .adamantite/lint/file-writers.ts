import { createRequire } from "node:module"
import { join, relative, sep } from "node:path"
// `adamantite/rules/plugin` resolves to `dist`, which the tests and the editor Oxlint do not build first.
import { type Context, defineRule, type ESTree, type Scope } from "#presets/rules/plugin.ts"

// The modules of `src` that change the disk. A folder covers each file below it. Setup writes the
// managed files and the lockfile. The other writers write outside them: `rule add` writes the stub of
// a new custom rule, the VS Code integration's `prepare`, which Setup runs, writes the Effect SDK
// copy in `node_modules`, a trial writes cases and configs in a temporary copy of the project, the
// Oxlint probe and the rule list of `harden` write their Oxlint configs to a temporary folder, and
// `filesystem.ts` holds the `ensureDirectory` and `writeFile` helpers that writers call.
const WRITERS = [
  "src/lib/setup",
  "src/lib/project/custom-rules/index.ts",
  "src/lib/integrations/effect-sdk.ts",
  "src/lib/hardening/trial.ts",
  "src/lib/hardening/oxlint.ts",
  "src/lib/integrations/oxlint/probe.ts",
  "src/lib/shared/filesystem.ts",
]

// `open` can open a file for writing.
const WRITE_METHODS = new Set([
  "chmod",
  "chown",
  "copy",
  "copyFile",
  "link",
  "makeDirectory",
  "makeTempDirectory",
  "makeTempDirectoryScoped",
  "makeTempFile",
  "makeTempFileScoped",
  "open",
  "remove",
  "rename",
  "sink",
  "symlink",
  "truncate",
  "utimes",
  "writeFile",
  "writeFileString",
])

const WRITE_HELPERS = new Set(["ensureDirectory", "writeFile"])

const HELPERS_MODULE = "src/lib/shared/filesystem.ts"

const NODE_FS = new Set(["fs", "fs/promises", "node:fs", "node:fs/promises"])

const CALLBACK_COMBINATORS = new Set(["andThen", "flatMap", "map", "tap"])

// The pipe steps of Effect 4.1.2 that keep the success value, so the steps after them still receive
// the service. Each one returns `Effect<A, …>` for its input `Effect<A, …>`. `andThen`, `flatMap`,
// `map`, and every step that this list does not name may change the value, so the pipe stops there.
const KEEPS_VALUE = new Set([
  "annotateLogs",
  "annotateSpans",
  "retry",
  "tap",
  "tapCause",
  "tapError",
  "timeout",
  "withLogSpan",
  "withSpan",
])

const ROOT = join(import.meta.dirname, "../..")

function stringValue(node: ESTree.Node) {
  return node.type === "Literal" && typeof node.value === "string" ? node.value : undefined
}

function keyName(key: ESTree.Node, computed: boolean) {
  return !computed && key.type === "Identifier" ? key.name : stringValue(key)
}

function memberName(node: ESTree.Node) {
  return node.type === "MemberExpression" ? keyName(node.property, node.computed) : undefined
}

function importedName(specifier: ESTree.ImportSpecifier) {
  return specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name
}

function referencesOf(context: Context, node: ESTree.Node, name?: string) {
  return context.sourceCode
    .getDeclaredVariables(node)
    .filter((variable) => name === undefined || variable.name === name)
    .flatMap((variable) => variable.references)
    .map((reference) => reference.identifier)
}

function findMembers(context: Context, specifier: ESTree.ImportNamespaceSpecifier) {
  return referencesOf(context, specifier).flatMap(({ parent }) =>
    parent.type === "MemberExpression" ? [parent] : []
  )
}

function findFileSystemExports(context: Context, node: ESTree.ImportDeclaration) {
  return node.specifiers.flatMap<ESTree.Node>((specifier) => {
    if (specifier.type === "ImportNamespaceSpecifier") {
      return findMembers(context, specifier).filter((member) => memberName(member) === "FileSystem")
    }

    return specifier.type === "ImportSpecifier" && importedName(specifier) === "FileSystem"
      ? referencesOf(context, specifier)
      : []
  })
}

// The `FileSystem` export of `effect/FileSystem` is the tag, and the `FileSystem` export of `effect`
// is the `effect/FileSystem` module.
function findTags(context: Context, node: ESTree.ImportDeclaration) {
  const exports = findFileSystemExports(context, node)

  if (node.source.value === "effect/FileSystem") {
    return exports
  }

  return node.source.value === "effect"
    ? exports.flatMap(({ parent }) =>
        parent !== null && memberName(parent) === "FileSystem" ? [parent] : []
      )
    : []
}

function findImportSpecifier(context: Context, node: ESTree.Node) {
  if (node.type !== "Identifier") {
    return null
  }

  let scope: Scope | null = context.sourceCode.getScope(node)

  while (scope !== null && !scope.set.has(node.name)) {
    scope = scope.upper
  }

  const [definition] = scope?.set.get(node.name)?.defs ?? []

  return definition?.type === "ImportBinding" ? definition.node : null
}

function importSource(specifier: ESTree.Node) {
  return specifier.parent?.type === "ImportDeclaration" ? specifier.parent.source.value : null
}

function isEffectModule(context: Context, node: ESTree.Node): boolean {
  if (node.type === "MemberExpression") {
    const specifier = findImportSpecifier(context, node.object)

    return (
      memberName(node) === "Effect"
      && specifier?.type === "ImportNamespaceSpecifier"
      && importSource(specifier) === "effect"
    )
  }

  const specifier = findImportSpecifier(context, node)

  if (specifier?.type === "ImportSpecifier") {
    return importSource(specifier) === "effect" && importedName(specifier) === "Effect"
  }

  return specifier !== null && importSource(specifier) === "effect/Effect"
}

function findEffectExport(context: Context, node: ESTree.Node | undefined) {
  const callee = node?.type === "CallExpression" ? node.callee : undefined

  if (callee?.type === "MemberExpression") {
    return isEffectModule(context, callee.object) ? memberName(callee) : undefined
  }

  const specifier = callee === undefined ? null : findImportSpecifier(context, callee)

  return specifier?.type === "ImportSpecifier" && importSource(specifier) === "effect/Effect"
    ? importedName(specifier)
    : undefined
}

function callbackParameter(context: Context, node: ESTree.Node | undefined, index: number) {
  const callback =
    node?.type === "CallExpression"
    && CALLBACK_COMBINATORS.has(findEffectExport(context, node) ?? "")
      ? node.arguments[index]
      : undefined

  return callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression"
    ? callback.params[0]
    : undefined
}

function findServiceParameters(context: Context, tag: ESTree.Node) {
  const { parent } = tag

  if (parent?.type === "CallExpression" && parent.arguments[0] === tag) {
    return [callbackParameter(context, parent, 1)]
  }

  const call =
    parent?.type === "MemberExpression" && memberName(parent) === "pipe" ? parent.parent : undefined

  if (call?.type !== "CallExpression" || call.callee !== parent) {
    return []
  }

  const steps = call.arguments

  const end = steps.findIndex((step) => !KEEPS_VALUE.has(findEffectExport(context, step) ?? ""))

  return (end === -1 ? steps : steps.slice(0, end + 1)).map((step) =>
    callbackParameter(context, step, 0)
  )
}

export default defineRule({
  createOnce(context) {
    let file = ""

    function reportWrite(method: string | undefined, node: ESTree.Node) {
      if (method !== undefined && WRITE_METHODS.has(method)) {
        context.report({ data: { method }, messageId: "write", node })
      }
    }

    function reportBinding(pattern: ESTree.Node) {
      if (pattern.type === "Identifier") {
        for (const identifier of referencesOf(context, pattern.parent, pattern.name)) {
          reportService(identifier)
        }
      }

      if (pattern.type !== "ObjectPattern") {
        return
      }

      for (const property of pattern.properties) {
        if (property.type === "Property") {
          reportWrite(keyName(property.key, property.computed), property)
        }
      }
    }

    function reportService(node: ESTree.Node) {
      const { parent } = node

      if (parent?.type === "MemberExpression" && parent.object === node) {
        reportWrite(memberName(parent), parent)
      }

      if (parent?.type === "VariableDeclarator" && parent.init === node) {
        reportBinding(parent.id)
      }
    }

    function reportTag(tag: ESTree.Node) {
      const { parent } = tag

      if (parent?.type === "YieldExpression" && parent.delegate) {
        reportService(parent)
      }

      for (const parameter of findServiceParameters(context, tag)) {
        if (parameter !== undefined) {
          reportBinding(parameter)
        }
      }
    }

    function reportHelper(name: string | undefined, node: ESTree.Node) {
      if (name !== undefined && WRITE_HELPERS.has(name)) {
        context.report({ data: { name }, messageId: "helper", node })
      }
    }

    function resolveImport(source: string) {
      if (!source.startsWith(".") && !source.startsWith("#")) {
        return null
      }

      try {
        return relative(ROOT, createRequire(context.filename).resolve(source)).split(sep).join("/")
      } catch {
        return null
      }
    }

    function reportNodeFs(node: ESTree.Node, source: ESTree.Node) {
      const name = stringValue(source)

      if (name !== undefined && NODE_FS.has(name) && !file.endsWith(".macro.ts")) {
        context.report({ data: { source: name }, messageId: "nodeFs", node })
      }
    }

    return {
      ImportDeclaration(node) {
        reportNodeFs(node, node.source)

        if (WRITERS.some((writer) => file === writer || file.startsWith(`${writer}/`))) {
          return
        }

        for (const tag of findTags(context, node)) {
          reportTag(tag)
        }

        if (resolveImport(node.source.value) !== HELPERS_MODULE) {
          return
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            reportHelper(importedName(specifier), specifier)
          }

          if (specifier.type === "ImportNamespaceSpecifier") {
            for (const member of findMembers(context, specifier)) {
              reportHelper(memberName(member), member)
            }
          }
        }
      },
      ImportExpression(node) {
        reportNodeFs(node, node.source)
      },
      before() {
        file = relative(ROOT, context.filename).split(sep).join("/")

        return file.startsWith("src/") && !file.split("/").includes("__tests__")
      },
    }
  },
  meta: {
    docs: { description: "Allow only the file writers of `src` to change the disk." },
    messages: {
      helper:
        "Only the file writers in `.adamantite/lint/file-writers.ts` import `{{name}}`. Write a managed file through `Setup.apply` in `src/lib/setup`. See docs/architecture.md.",
      nodeFs:
        "Use `FileSystem` from `effect/FileSystem` instead of `{{source}}`, so `project/file-writers` sees each write. Only a build-time `*.macro.ts` file imports `{{source}}`.",
      write:
        "Only the file writers in `.adamantite/lint/file-writers.ts` call `FileSystem.{{method}}`, which changes the disk. Write a managed file through `Setup.apply` in `src/lib/setup`. See docs/architecture.md.",
    },
    schema: [],
    type: "problem",
  },
})
