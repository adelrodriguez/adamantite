import { join, relative, sep } from "node:path"
// `adamantite/rules/plugin` resolves to `dist`, which `pnpm run check` does not build first.
import { type Context, defineRule, type ESTree } from "#presets/rules/plugin.ts"

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

// The methods of Effect's `FileSystem` that change the disk. `open` can open a file for writing.
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

const NODE_FS = new Set(["fs", "fs/promises", "node:fs", "node:fs/promises"])

// The Effect combinators whose callback receives the service, as in
// `Effect.flatMap(FileSystem.FileSystem, (fs) => …)`.
const CALLBACK_COMBINATORS = new Set(["andThen", "flatMap", "map", "tap"])

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

// The references of the variables that `node` declares, or only of the one called `name`.
function referencesOf(context: Context, node: ESTree.Node, name?: string) {
  return context.sourceCode
    .getDeclaredVariables(node)
    .filter((variable) => name === undefined || variable.name === name)
    .flatMap((variable) => variable.references)
    .map((reference) => reference.identifier)
}

// The expressions that give the `FileSystem` tag: `FileSystem.FileSystem` through a namespace import,
// and the tag itself through a named import.
function findTags(context: Context, node: ESTree.ImportDeclaration) {
  return node.specifiers.flatMap((specifier) => {
    if (specifier.type === "ImportNamespaceSpecifier") {
      return referencesOf(context, specifier)
        .map((identifier) => identifier.parent)
        .filter((parent) => memberName(parent) === "FileSystem")
    }

    return specifier.type === "ImportSpecifier" && importedName(specifier) === "FileSystem"
      ? referencesOf(context, specifier)
      : []
  })
}

// The first parameter of the callback at `index` of a combinator call, such as `fs` in
// `Effect.flatMap(FileSystem.FileSystem, (fs) => …)`.
function callbackParameter(node: ESTree.Node | undefined, index: number) {
  const callback =
    node?.type === "CallExpression" && CALLBACK_COMBINATORS.has(memberName(node.callee) ?? "")
      ? node.arguments[index]
      : undefined

  return callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression"
    ? callback.params[0]
    : undefined
}

// The binding that receives the service from `tag` in a callback.
function findServiceParameter(tag: ESTree.Node) {
  const { parent } = tag

  // `Effect.flatMap(FileSystem.FileSystem, (fs) => …)`
  if (parent?.type === "CallExpression" && parent.arguments[0] === tag) {
    return callbackParameter(parent, 1)
  }

  // `FileSystem.FileSystem.pipe(Effect.flatMap((fs) => …))`
  const call =
    parent?.type === "MemberExpression" && memberName(parent) === "pipe" ? parent.parent : undefined

  return call?.type === "CallExpression" && call.callee === parent
    ? callbackParameter(call.arguments[0], 0)
    : undefined
}

export default defineRule({
  createOnce(context) {
    let file = ""

    function reportWrite(method: string | undefined, node: ESTree.Node) {
      if (method !== undefined && WRITE_METHODS.has(method)) {
        context.report({ data: { method }, messageId: "write", node })
      }
    }

    // A binding of the service: `fs`, or `{ remove }` that takes its methods.
    function reportBinding(pattern: ESTree.Node) {
      if (pattern.type === "Identifier") {
        for (const identifier of referencesOf(context, pattern.parent, pattern.name)) {
          reportService(identifier)
        }
      }

      if (pattern.type !== "ObjectPattern") return

      for (const property of pattern.properties) {
        if (property.type === "Property") {
          reportWrite(keyName(property.key, property.computed), property)
        }
      }
    }

    // A node whose value is the service, such as `fs` or `yield* FileSystem.FileSystem`.
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

      // `yield* FileSystem.FileSystem`
      if (parent?.type === "YieldExpression" && parent.delegate) {
        reportService(parent)
      }

      const parameter = findServiceParameter(tag)

      if (parameter !== undefined) reportBinding(parameter)
    }

    // The build-time macros read their templates with `node:fs`.
    function reportNodeFs(node: ESTree.Node, source: ESTree.Node) {
      const name = stringValue(source)

      if (name !== undefined && NODE_FS.has(name) && !file.endsWith(".macro.ts")) {
        context.report({ data: { source: name }, messageId: "nodeFs", node })
      }
    }

    return {
      ImportDeclaration(node) {
        reportNodeFs(node, node.source)

        if (WRITERS.some((writer) => file === writer || file.startsWith(`${writer}/`))) return

        if (node.source.value === "effect/FileSystem") {
          for (const tag of findTags(context, node)) reportTag(tag)
        }

        if (node.source.value !== "#lib/shared/filesystem.ts") return

        for (const specifier of node.specifiers) {
          const name = specifier.type === "ImportSpecifier" ? importedName(specifier) : ""

          if (WRITE_HELPERS.has(name)) {
            context.report({ data: { name }, messageId: "helper", node: specifier })
          }
        }
      },
      ImportExpression(node) {
        reportNodeFs(node, node.source)
      },
      // Only the non-test files of `src`.
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
