import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const CORE_PRESET = join(REPO_ROOT, "presets/lint/core.ts")

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })) })
  )
)

/**
 * Lint one file with the core preset in one real Oxlint run, through the Oxlint entry. The config
 * turns on the type-aware rules, as the config that init writes does.
 */
function lint(file: string, source: string) {
  const project = mkdtempSync(join(tmpdir(), "adamantite-core-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(project, "node_modules"))
    writeFileSync(join(project, file), source)
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({ name: "fixture", type: "module" })
    )
    writeFileSync(
      join(project, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "esnext", moduleResolution: "bundler", strict: true },
      })
    )
    writeFileSync(
      join(project, "oxlint.config.ts"),
      [
        `import core from ${JSON.stringify(CORE_PRESET)}`,
        "",
        "export default { extends: [core], options: { typeAware: true } }",
        "",
      ].join("\n")
    )

    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "src/oxlint.ts"), "-c", "oxlint.config.ts", "-f", "json", file],
      { cwd: project, encoding: "utf8" }
    )

    return decodeOxlintJsonOutput(result.stdout).diagnostics.map((diagnostic) => diagnostic.code)
  } finally {
    rmSync(project, { force: true, recursive: true })
  }
}

describe("core preset", () => {
  // `no-await-in-loop` tells the author to start the calls together. That is a defect when each
  // call needs the result of the call before it, and a lint rule cannot tell the two cases apart.
  it("accept an await in a loop", () => {
    const codes = lint(
      "index.ts",
      [
        "export async function send(urls: readonly string[]) {",
        "  for (const url of urls) {",
        "    await fetch(url)",
        "  }",
        "}",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  // `typescript/only-throw-error` reads the type of the thrown value, so it reports every throw
  // that `no-throw-literal` reports. With both rules on, one throw needs two suppressions.
  it("report a thrown value that is not an error one time", () => {
    const codes = lint(
      "index.ts",
      ["export function fail(): never {", '  throw "failed"', "}", ""].join("\n")
    )

    expect(codes).toStrictEqual(["typescript(only-throw-error)"])
  })

  // Astro, Vue, and Svelte compile a component's script as a module, so the script needs no
  // `import` or `export` to be one.
  it.each([
    ["card.astro", ["---", "const a = 1", "---", "<p>{a}</p>", ""]],
    [
      "card.vue",
      [
        '<script setup lang="ts">',
        "const a = 1",
        "</script>",
        "<template><p>{{ a }}</p></template>",
        "",
      ],
    ],
    ["card.svelte", ['<script lang="ts">', "const a = 1", "</script>", "<p>{a}</p>", ""]],
  ])("accept a script without an import or export in %s", (file, lines) => {
    const codes = lint(file, lines.join("\n"))

    expect(codes).toStrictEqual([])
  })

  it("report a TypeScript file without an import or export", () => {
    const codes = lint("index.ts", ["console.info(1)", ""].join("\n"))

    expect(codes).toStrictEqual(["import(unambiguous)"])
  })

  // A declaration file without an import or export is a script on purpose: only a script can
  // declare a wildcard module or a global.
  it("accept a declaration file without an import or export", () => {
    const codes = lint(
      "raw.d.ts",
      [
        'declare module "*?raw" {',
        "  const content: string",
        "  export default content",
        "}",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  // TypeScript lets a type and a value share a name, as in a schema and the type that it infers.
  // `no-redeclare` reads the pair as one name declared two times. The type check reports a name
  // that is declared two times as a value.
  it("accept a type and a value that share a name", () => {
    const codes = lint(
      "index.ts",
      ["export const port = 8080", "export type port = typeof port", ""].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  // A JavaScript file has no type syntax, so JSDoc is its only way to state a type.
  it("accept JSDoc type tags in a JavaScript file and report them in a TypeScript file", () => {
    const source = ["/** @type {string[]} */", "export const names = []", ""].join("\n")

    expect(lint("names.mjs", source)).toStrictEqual([])
    expect(lint("names.ts", source)).toContain("jsdoc(check-tag-names)")
  })

  // A spread in a `map` callback is the usual way to copy an item with a change, as a React state
  // update does.
  it("accept a spread copy of an item in a map callback", () => {
    const codes = lint(
      "index.ts",
      [
        "interface Todo {",
        "  readonly done: boolean",
        "  readonly id: string",
        "}",
        "",
        "declare function loadTodos(): Todo[]",
        "",
        "export function toggle(id: string): Todo[] {",
        "  return loadTodos().map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo))",
        "}",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  // A copy of a `reduce` accumulator with fixed keys cannot grow. `oxc/no-accumulating-spread`
  // reports the spread form, so core must accept the `Object.assign({}, …)` form.
  it("accept an Object.assign copy of a reduce accumulator", () => {
    const codes = lint(
      "index.ts",
      [
        "const items = [{ n: 1 }, { n: 2 }]",
        "",
        "export const total = items.reduce((acc, item) => Object.assign({}, acc, { sum: acc.sum + item.n }), {",
        "  sum: 0,",
        "})",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  // `eslint/no-empty-function` reports `() => {}`, and `eslint/array-callback-return` and
  // `eslint/no-useless-return` report a bare `return` in a `map` callback. Core must accept the
  // explicit `undefined` that these rules need.
  it("accept an explicit undefined where another core rule needs a value", () => {
    const codes = lint(
      "index.ts",
      [
        "declare function use(callback: () => undefined): void",
        "declare const flags: boolean[]",
        "",
        "use(() => undefined)",
        "",
        "export const mapped = flags.map((flag) => {",
        "  if (flag) {",
        "    return 1",
        "  }",
        "",
        "  return undefined",
        "})",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  // `typescript/no-non-null-assertion` bans `maybe!`, so core must not tell the author to write it.
  it("not recommend the non-null assertion that core bans", () => {
    const codes = lint(
      "index.ts",
      [
        "declare const maybe: string | undefined",
        "",
        "export const a: string = maybe as string",
        "export const b: string = maybe!",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual(["typescript(no-non-null-assertion)"])
  })
})
