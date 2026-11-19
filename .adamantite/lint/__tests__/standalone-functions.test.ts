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
    {
      code: `export const toKnipWorkspace = ({ workspace }: Project, { presets }: Selection): KnipWorkspace => ({
  isMonorepo: workspace.isMonorepo,
  usesEffectPreset: presets.includes("effect"),
})`,
      errors: [declare("toKnipWorkspace")],
    },
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
    {
      code: "const skip = () => undefined",
      errors: [declare("skip")],
    },
    {
      code: "export const render = (() => {\n  return 1\n}) satisfies () => number",
      errors: [declare("render")],
    },
    {
      code: "const toResult = ((value: string) => ({ ok: true, value })) as Convert",
      errors: [declare("toResult")],
    },
    {
      code: "const compare = (order: Order) => (left: Item, right: Item) => {\n  return order(left.name, right.name)\n}",
      errors: [declare("compare")],
    },
    // A function inside another function is standalone too.
    {
      code: `export function makeReader(path: Path) {
  const relativePath = (file: string) => {
    return path.relative("/", file)
  }
  return relativePath
}`,
      errors: [declare("relativePath")],
    },
    {
      code: `export const listHidden = Effect.gen(function* () {
  const isHidden = (file: string) => file === ".git"
  return (yield* listFiles).filter(isHidden)
})`,
      errors: [declare("isHidden")],
    },
    {
      code: `export const handlers = {
  run(items: Item[]) {
    const toName = (item: Item) => {
      return item.name
    }
    return items.map(toName)
  },
}`,
      errors: [declare("toName")],
    },
  ],
  valid: [
    `export function toKnipWorkspace({ workspace }: Project, { presets }: Selection): KnipWorkspace {
  return {
    isMonorepo: workspace.isMonorepo,
    usesEffectPreset: presets.includes("effect"),
  }
}`,
    `export const readFile = (path: string) =>
  FileSystem.FileSystem.pipe(Effect.flatMap((fs) => fs.readFileString(path)))`,
    `const readWorkspace = (cwd: string) =>
  Effect.gen(function* () {
    return yield* readPackageJson(cwd)
  })`,
    "const log = (status: Status) => (message: string) => Effect.flatMap(CurrentMode, (mode) => write(mode, status, message))",
    `const toResult = (options: Options, code: ExitCode) =>
  code === 0 ? Effect.void : Effect.fail(new CommandFailed({ command: options.command }))`,
    "const orElse = (fallback: Fallback) => fallback.effect ?? Effect.void",
    "const readPath = ((path: string) => Effect.succeed(path)) satisfies Reader",
    `export const names = items.map((item) => {
  return item.name
})
export const handlers = { run: () => 1, stop: function () {} }`,
    'const run = Effect.fn("run")(function* (path: string) {\n  return yield* readFile(path)\n})',
    // A function inside another function that directly returns an Effect chain.
    `export function makeReader(fs: FileSystem) {
  const read = (path: string) => fs.readFileString(path).pipe(Effect.orDie)
  return read
}`,
    // A callback inside a function has no name of its own.
    `export function listNames(items: Item[]) {
  return items.map((item) => {
    return item.name
  })
}`,
  ],
})
