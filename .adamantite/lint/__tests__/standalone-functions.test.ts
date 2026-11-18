import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import rule from "../standalone-functions.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" }, sourceType: "module" },
})

function declare(name: string) {
  return { data: { name }, messageId: "declare" }
}

tester.run("standalone-functions", rule, {
  invalid: [
    // The form that `CODING_STANDARDS.md` showed for the Knip workspace helper.
    {
      code: `export const toKnipWorkspace = ({ workspace }: Project, { presets }: Selection): KnipWorkspace => ({
  isMonorepo: workspace.isMonorepo,
  usesEffectPreset: presets.includes("effect"),
})`,
      errors: [declare("toKnipWorkspace")],
    },
    // A block body returns nothing directly, also when a statement of it returns an Effect.
    {
      code: `const offer = (work: Work) => {
  const unattended = Effect.succeed(work)
  return unattended.pipe(Effect.map(render))
}`,
      errors: [declare("offer")],
    },
    {
      code: "export const render = function (line: string) {\n  return line.trim()\n}",
      errors: [declare("render")],
    },
    {
      code: "const load = async (path: string) => readFile(path)",
      errors: [declare("load")],
    },
    // A condition is a plain value, whatever its last operand is.
    {
      code: 'const isTagMember = (node: Node) => node.type === "MemberExpression" && names.has(node.name)',
      errors: [declare("isTagMember")],
    },
    {
      code: 'const isFunction = (node: Node) => node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression"',
      errors: [declare("isFunction")],
    },
    {
      code: "const isNotSemicolon = (token: Token) => !isSemicolon(token)",
      errors: [declare("isNotSemicolon")],
    },
    {
      code: 'const toLabel = (count: number) => (count === 1 ? "file" : "files")',
      errors: [declare("toLabel")],
    },
    // One plain side is enough: the function then returns more than an Effect chain.
    {
      code: 'const find = (name: string) => (name === "" ? null : lookup(name))',
      errors: [declare("find")],
    },
    {
      code: 'const toName = (name?: string) => name ?? "none"',
      errors: [declare("toName")],
    },
    {
      code: 'const toInvalid = (reason: string) => ({ kind: "invalid", reason }) as const',
      errors: [declare("toInvalid")],
    },
    {
      code: "let noop = () => null",
      errors: [declare("noop")],
    },
    // An arrow that returns a function returns what that function returns.
    {
      code: "const compare = (order: Order) => (left: Item, right: Item) => {\n  return order(left.name, right.name)\n}",
      errors: [declare("compare")],
    },
  ],
  valid: [
    `export function toKnipWorkspace({ workspace }: Project, { presets }: Selection): KnipWorkspace {
  return {
    isMonorepo: workspace.isMonorepo,
    usesEffectPreset: presets.includes("effect"),
  }
}`,
    // A function that directly returns an Effect chain.
    `export const readFile = (path: string) =>
  FileSystem.FileSystem.pipe(Effect.flatMap((fs) => fs.readFileString(path)))`,
    `const readWorkspace = (cwd: string) =>
  Effect.gen(function* () {
    return yield* readPackageJson(cwd)
  })`,
    "const log = (status: Status) => (message: string) => Effect.flatMap(CurrentMode, (mode) => write(mode, status, message))",
    // A condition between two Effects gives no plain value.
    `const toResult = (options: Options, code: ExitCode) =>
  code === 0 ? Effect.void : Effect.fail(new CommandFailed({ command: options.command }))`,
    "const orElse = (fallback: Fallback) => fallback.effect ?? Effect.void",
    // A callback and an object method are not standalone functions.
    `export const names = items.map((item) => {
  return item.name
})
export const handlers = { run: () => 1, stop: function () {} }`,
    'const run = Effect.fn("run")(function* (path: string) {\n  return yield* readFile(path)\n})',
    // The rule covers only the functions of the module scope.
    `export function makeReader(path: Path) {
  const relativePath = (file: string) => {
    return path.relative("/", file)
  }
  return relativePath
}`,
  ],
})
