/**
 * Turns each arrow that `project/standalone-functions` reports into a function declaration. The
 * rule is the only source of the sites: the script lints the repository and rewrites the variable
 * declaration at each report. It skips a site that needs a decision, such as a variable with a type
 * annotation, and names it for a fix by hand.
 *
 *     node scripts/declare-standalone-functions.ts                  # List the sites.
 *     node scripts/declare-standalone-functions.ts --write          # Rewrite the files.
 *     node scripts/declare-standalone-functions.ts --verify <ref>   # Compare the files with <ref>.
 *
 * Run `pnpm run build` first, and `pnpm run fix` after `--write`. `--verify` compares the syntax
 * tree and the comments of each TypeScript file that differs from `<ref>` with the file at `<ref>`.
 * It reads `const name = (…) => value` and `function name(…) { return value }` as the same
 * function, so it fails for a file that changed in any other way.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import process from "node:process"
import { isDeepStrictEqual } from "node:util"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

const ROOT = join(import.meta.dirname, "..")

const CLI = join(ROOT, "bin", "adamantite")

const RULE = "project(standalone-functions)"

// `adamantite rule ast` reads only the files of the project, so `--verify` copies the file of
// `<ref>` to this folder of the repository.
const CACHE = join("node_modules", ".cache", "adamantite", "declare-standalone-functions")

type Json = Schema.Json

type Node = { readonly [key: string]: Json }

const LintOutput = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(
      Schema.Struct({
        code: Schema.String,
        filename: Schema.String,
        labels: Schema.Array(Schema.Struct({ span: Schema.Struct({ line: Schema.Int }) })),
      })
    ),
  })
)

const SyntaxTree = Schema.fromJsonString(Schema.Struct({ program: Schema.Json }))

function isNode(value: Json | undefined): value is Node {
  return Predicate.isObject(value) && Predicate.isString(value["type"])
}

function isList(value: Json | undefined): value is readonly Json[] {
  return Array.isArray(value)
}

function readNode(node: Node, key: string) {
  const value = node[key]

  return isNode(value) ? value : undefined
}

function readNodes(node: Node, key: string) {
  const value = node[key]

  return isList(value) ? value.filter((item) => isNode(item)) : []
}

function readOffset(node: Node, key: "end" | "start") {
  const value = node[key]

  if (!Predicate.isNumber(value)) {
    throw new TypeError(`Expected each node of the syntax tree to have a number as \`${key}\`.`)
  }

  return value
}

function runCli(args: readonly string[]) {
  // The lint exits with code 1 while the rule reports, so the script reads the output of each run.
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }).stdout
}

/**
 * The lines that the rule reports in each file.
 */
function listReports() {
  const output = runCli(["check", "--only", "lint", "--", "--format", "json"])
  // The CLI prints the heading of the stage before the JSON document of Oxlint.
  const { diagnostics } = Schema.decodeSync(LintOutput)(output.slice(output.indexOf("{")))
  const reports = new Map<string, Set<number>>()

  for (const { code, filename, labels } of diagnostics) {
    const [label] = labels

    if (code === RULE && label !== undefined) {
      reports.set(filename, (reports.get(filename) ?? new Set()).add(label.span.line))
    }
  }

  return reports
}

/**
 * The syntax tree that Oxlint rules get for a file of the repository.
 */
function parse(file: string) {
  const { program } = Schema.decodeSync(SyntaxTree)(runCli(["rule", "ast", "--json", file]))

  if (!isNode(program)) {
    throw new TypeError(`Expected \`adamantite rule ast\` to print the syntax tree of ${file}.`)
  }

  return program
}

function isSyntax(key: string) {
  return key !== "comments" && key !== "tokens"
}

/**
 * The child nodes of a node, without the comments and the tokens of the program.
 */
function listChildren(node: Node) {
  return Object.entries(node)
    .filter(([key]) => isSyntax(key))
    .flatMap(([, value]) => (isList(value) ? value : [value]))
    .filter((child) => isNode(child))
}

/**
 * Each variable declarator of the tree with the declaration that holds it.
 */
function listDeclarators(declaration: Node): Array<readonly [declarator: Node, declaration: Node]> {
  return listChildren(declaration).flatMap((child) => [
    ...(child["type"] === "VariableDeclarator" ? [[child, declaration] as const] : []),
    ...listDeclarators(child),
  ])
}

/**
 * Whether an arrow reads `this`, `arguments`, `super`, or `new.target` of the function around it. A
 * function declaration has its own, so the arrow cannot become one.
 */
function readsEnclosingFunction(arrow: Node) {
  const pending = [arrow]

  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (
      node["type"] === "ThisExpression"
      || node["type"] === "Super"
      || node["type"] === "MetaProperty"
      || (node["type"] === "Identifier" && node["name"] === "arguments")
    ) {
      return true
    }

    // A function that is not an arrow has its own `this`. A name after a dot or before a colon,
    // such as `call.arguments`, is not a variable.
    if (node["type"] !== "FunctionDeclaration" && node["type"] !== "FunctionExpression") {
      const name = node["computed"] === false ? (node["property"] ?? node["key"]) : undefined

      pending.push(...listChildren(node).filter((child) => child !== name))
    }
  }

  return false
}

interface Site {
  readonly end: number
  readonly line: number
  readonly name: string
  readonly start: number
}

type Conversion =
  | (Site & { readonly kind: "declared"; readonly text: string })
  | (Site & { readonly kind: "skipped"; readonly reason: string })

/**
 * The function declaration for the variable declaration at a report, or the reason that the site
 * needs a fix by hand.
 */
function convert(source: string, program: Node, declaration: Node, declarator: Node): Conversion {
  const id = readNode(declarator, "id")
  const init = readNode(declarator, "init")
  const start = readOffset(declaration, "start")

  const name = id?.["name"]

  const site = {
    end: readOffset(declaration, "end"),
    line: source.slice(0, start).split("\n").length,
    name: Predicate.isString(name) ? name : "",
    start,
  }

  function skip(reason: string): Conversion {
    return { ...site, kind: "skipped", reason }
  }

  if (declaration["kind"] !== "const" || readNodes(declaration, "declarations").length !== 1) {
    return skip("The declaration is not one `const` variable.")
  }

  if (id === undefined || readNode(id, "typeAnnotation") !== undefined) {
    return skip("The variable has a type annotation, so the declaration must state the types.")
  }

  if (init?.["type"] !== "ArrowFunctionExpression") {
    return skip("The value is not a plain arrow.")
  }

  if (readsEnclosingFunction(init)) {
    return skip("The arrow reads `this` or `arguments` of the function around it.")
  }

  const body = readNode(init, "body")

  // The `=>` of the arrow is the last one before its body. An earlier one belongs to a type.
  const arrow = readNodes(program, "tokens")
    .filter(
      (token) =>
        token["value"] === "=>"
        && readOffset(token, "start") >= readOffset(init, "start")
        && body !== undefined
        && readOffset(token, "end") <= readOffset(body, "start")
    )
    .at(-1)

  if (body === undefined || arrow === undefined) {
    return skip("The script did not find the `=>` of the arrow.")
  }

  const head = source.slice(readOffset(init, "start"), readOffset(arrow, "start")).trim()
  const signature = init["async"] === true ? head.replace(/^async\s*/u, "") : head
  const value = source.slice(readOffset(arrow, "end"), readOffset(init, "end")).trim()

  // `return` and a comment on the next line would return nothing.
  if (value.startsWith("/")) {
    return skip("A comment stands between `=>` and the body.")
  }

  return {
    ...site,
    kind: "declared",
    text: [
      init["async"] === true ? "async " : "",
      `function ${site.name}`,
      /^[(<]/u.test(signature) ? signature : `(${signature})`,
      " ",
      body["type"] === "BlockStatement" ? value : `{\nreturn ${value}\n}`,
    ].join(""),
  }
}

/**
 * The conversion of each reported variable in a file, from the last one to the first.
 */
function convertFile(file: string, lines: ReadonlySet<number>) {
  const source = readFileSync(join(ROOT, file), "utf8")
  const program = parse(file)

  const conversions = listDeclarators(program).flatMap(([declarator, declaration]) => {
    const id = readNode(declarator, "id")

    return id !== undefined
      && lines.has(source.slice(0, readOffset(id, "start")).split("\n").length)
      ? [convert(source, program, declaration, declarator)]
      : []
  })

  return EffectArray.sort(
    conversions,
    Order.mapInput(Order.flip(Order.Number), ({ start }: Conversion) => start)
  )
}

/**
 * Rewrite the reported functions of a file. A function that holds another reported function waits
 * for the next pass, because the first rewrite moves its text.
 */
function rewrite(file: string, conversions: readonly Conversion[]) {
  let source = readFileSync(join(ROOT, file), "utf8")
  let rewritten = Number.POSITIVE_INFINITY
  const declared: Conversion[] = []

  for (const conversion of conversions) {
    if (conversion.kind === "declared" && conversion.end <= rewritten) {
      source = source.slice(0, conversion.start) + conversion.text + source.slice(conversion.end)
      rewritten = conversion.start
      declared.push(conversion)
    }
  }

  writeFileSync(join(ROOT, file), source)

  return declared
}

function describe(file: string, { line, name }: Site) {
  return `${file}:${line} ${name}`
}

/**
 * List the sites, and rewrite them with `--write` until a pass declares nothing.
 */
function declare(write: boolean) {
  const skipped = new Map<string, string>()
  let total = 0

  for (;;) {
    let declared = 0

    for (const [file, lines] of listReports()) {
      const conversions = convertFile(file, lines)
      const done = write ? rewrite(file, conversions) : conversions

      for (const conversion of conversions) {
        if (conversion.kind === "skipped") {
          skipped.set(describe(file, conversion), conversion.reason)
        }
      }

      for (const conversion of done.filter(({ kind }) => kind === "declared")) {
        console.info(`${write ? "Declared" : "Can declare"} ${describe(file, conversion)}`)
        declared += 1
      }
    }

    total += declared

    if (!write || declared === 0) {
      break
    }
  }

  for (const [site, reason] of skipped) {
    console.info(`Fix by hand ${site}: ${reason}`)
  }

  console.info(
    `${total} functions ${write ? "declared" : "to declare"}, ${skipped.size} to fix by hand.`
  )
}

const POSITIONS = new Set(["end", "loc", "range", "start"])

/**
 * The one form of `const name = (…) => value` and `function name(…) { return value }`.
 */
function normalizeFunction(name: Json | undefined, node: Node): Json {
  const body = readNode(node, "body")

  return {
    async: node["async"] ?? false,
    body:
      body === undefined || body["type"] === "BlockStatement"
        ? normalize(body ?? null)
        : {
            body: [{ argument: normalize(body), type: "ReturnStatement" }],
            type: "BlockStatement",
          },
    generator: node["generator"] ?? false,
    name: name ?? null,
    params: normalize(node["params"] ?? null),
    returnType: normalize(node["returnType"] ?? null),
    type: "StandaloneFunction",
    typeParameters: normalize(node["typeParameters"] ?? null),
  }
}

/**
 * A syntax tree without its positions, with each standalone function in one form.
 */
function normalize(value: Json): Json {
  if (isList(value)) {
    return value.map((item) => normalize(item))
  }

  if (!isNode(value)) {
    return value
  }

  if (value["type"] === "FunctionDeclaration") {
    return normalizeFunction(readNode(value, "id")?.["name"], value)
  }

  const [declarator, ...others] = readNodes(value, "declarations")
  const id = declarator === undefined ? undefined : readNode(declarator, "id")
  const init = declarator === undefined ? undefined : readNode(declarator, "init")

  if (
    value["type"] === "VariableDeclaration"
    && value["kind"] === "const"
    && others.length === 0
    && id?.["type"] === "Identifier"
    && readNode(id, "typeAnnotation") === undefined
    && init?.["type"] === "ArrowFunctionExpression"
  ) {
    return normalizeFunction(id["name"], init)
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !POSITIONS.has(key) && isSyntax(key))
      .map(([key, child]) => [key, normalize(child)])
  )
}

/**
 * The text of each comment of a file, without the indentation of its lines.
 */
function listComments(program: Node) {
  return readNodes(program, "comments").map((comment) => {
    const value = comment["value"]

    return Predicate.isString(value)
      ? value
          .split("\n")
          .map((line) => line.trimStart())
          .join("\n")
      : ""
  })
}

/**
 * Compare each changed TypeScript file with its version at `ref`.
 */
function verify(ref: string) {
  const files = execFileSync("git", ["diff", "--name-only", "--diff-filter=M", ref, "--", "*.ts"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file !== "")

  mkdirSync(join(ROOT, CACHE), { recursive: true })

  try {
    const changed = files.filter((file) => {
      const before = join(CACHE, basename(file))

      writeFileSync(
        join(ROOT, before),
        execFileSync("git", ["show", `${ref}:${file}`], { cwd: ROOT, encoding: "utf8" })
      )

      const [old, current] = [parse(before), parse(file)]

      const isSame =
        isDeepStrictEqual(normalize(old), normalize(current))
        && isDeepStrictEqual(listComments(old), listComments(current))

      console.info(`${isSame ? "Same functions" : "Changed"} ${file}`)

      return !isSame
    })

    console.info(
      `${files.length - changed.length} of ${files.length} files changed only in the form of a function.`
    )
    process.exitCode = changed.length === 0 ? 0 : 1
  } finally {
    rmSync(join(ROOT, CACHE), { force: true, recursive: true })
  }
}

const [flag, ref] = process.argv.slice(2)

if (flag === "--verify" && ref !== undefined) {
  verify(ref)
} else if (flag === undefined || flag === "--write") {
  declare(flag === "--write")
} else {
  throw new Error("Usage: node scripts/declare-standalone-functions.ts [--write | --verify <ref>]")
}
