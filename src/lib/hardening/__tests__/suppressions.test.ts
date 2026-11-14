import { describe, expect, it } from "@effect/vitest"
import { findSuppressions } from "#lib/workspace/suppressions.ts"

describe("findSuppressions", () => {
  it("read the rules and the line of each disable comment, without the reason", () => {
    expect(
      findSuppressions(
        "a.ts",
        [
          "/* oxlint-disable no-console, eslint/no-alert */",
          "// eslint-disable-next-line typescript/no-explicit-any -- the API returns any",
          "export const value: any = 1 // oxlint-disable-line no-magic-numbers",
          "// eslint-disable",
          "",
        ].join("\n")
      )
    ).toStrictEqual([
      { line: 1, rules: ["no-console", "eslint/no-alert"] },
      { line: 2, rules: ["typescript/no-explicit-any"] },
      { line: 3, rules: ["no-magic-numbers"] },
      { line: 4, rules: [] },
    ])
  })

  it("skip strings, enable comments, and comments that only mention a directive", () => {
    expect(
      findSuppressions(
        "a.ts",
        [
          'export const text = "// oxlint-disable-next-line no-console"',
          "// oxlint-enable no-console",
          "/**",
          " * oxlint-disable-line no-console",
          " */",
          "// Use oxlint-disable-next-line only with a reason.",
          "// oxlint-disabled no-console",
          "",
        ].join("\n")
      )
    ).toStrictEqual([])
  })

  it("find none in a file that does not parse", () => {
    expect(findSuppressions("a.ts", "// oxlint-disable\nexport const = ;\n")).toStrictEqual([])
  })
})

describe("component suppressions", () => {
  it.each([
    [
      "App.vue",
      '<template><div /></template>\n<script setup lang="ts">\n// oxlint-disable-next-line anti-slop/no-reflect-get -- migration\nconst value: number = Reflect.get({}, "a")\n</script>',
    ],
    [
      "App.svelte",
      '<script lang="ts">\n// oxlint-disable-next-line anti-slop/no-reflect-get -- migration\nconst value: number = Reflect.get({}, "a")\n</script>\n<div>{value}</div>',
    ],
    [
      "App.astro",
      '---\n// oxlint-disable-next-line anti-slop/no-reflect-get -- migration\nconst value: number = Reflect.get({}, "a")\n---\n<div>{value}</div>',
    ],
  ])("read embedded script comments in %s", (file, content) => {
    const line = content.split("\n").findIndex((text) => text.startsWith("// oxlint")) + 1
    expect(findSuppressions(file, content)).toStrictEqual([
      { line, rules: ["anti-slop/no-reflect-get"] },
    ])
  })
})
