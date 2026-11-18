import { existsSync, globSync } from "node:fs"
import { basename, dirname, join, sep } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Array from "effect/Array"
import * as Order from "effect/Order"

const REPO_ROOT = join(import.meta.dirname, "../..")

const STACK_TEST = "A stack test, named after the fixture tree or the preset that it lints."

/**
 * The test files that no module names, each with the reason.
 */
const EXCEPTIONS = {
  "presets/__tests__/architecture.test.ts": STACK_TEST,
  "presets/__tests__/core.test.ts": STACK_TEST,
  "presets/__tests__/effect.test.ts": STACK_TEST,
  "presets/__tests__/fixture-packages.test.ts":
    "Checks the fixture packages that the stack tests install, in `presets/__tests__/fixture-packages/`.",
  "presets/__tests__/import-owners.test.ts": STACK_TEST,
  "presets/__tests__/jest.test.ts": STACK_TEST,
  "presets/__tests__/layers.test.ts": STACK_TEST,
  "presets/__tests__/overlap.test.ts": STACK_TEST,
  "presets/__tests__/react-doctor.test.ts": STACK_TEST,
  "presets/__tests__/react-strict.test.ts": STACK_TEST,
  "presets/__tests__/require-safety-comment-for-type-assertion.test.ts":
    "Runs the rule of `presets/lint/plugins/quality/rules/` in real Oxlint, which validates its options.",
  "presets/__tests__/stacks.test.ts": STACK_TEST,
  "presets/__tests__/strict.test.ts": STACK_TEST,
  "presets/__tests__/tailwind.test.ts": STACK_TEST,
  "presets/__tests__/tanstack.test.ts": STACK_TEST,
  "presets/__tests__/typescript.test.ts": STACK_TEST,
  "presets/__tests__/vitest.test.ts": STACK_TEST,
  "src/__tests__/architecture-doc.test.ts":
    "Checks that `docs/architecture.md` matches the layer map of `oxlint.config.ts`.",
  "src/__tests__/doc-references.test.ts":
    "Checks the links and the source paths of the docs against the files of the repository.",
  "src/__tests__/exports.test.ts": "Checks the `exports` of `package.json` against the README.",
  "src/__tests__/macro-cache.test.ts":
    "Checks the macro cache workaround of `vitest.config.ts`, until unplugin-macros sets the cache key.",
  "src/__tests__/test-names.test.ts": "Checks the names of the test files.",
} as const satisfies Readonly<Record<string, string>>

/**
 * Whether a module has the name of the test file `<folder>/__tests__/<name>.test.ts`: the module
 * `<folder>/<name>.ts`, `<folder>/<name>/index.ts`, or `<folder>/<name>.macro.ts`, or the rule
 * `<folder>/rules/<name>.ts` of a RuleTester file.
 */
function hasModule(test: string) {
  const name = basename(test, ".test.ts")
  const folder = dirname(dirname(test))

  return (
    basename(dirname(test)) === "__tests__"
    && [`${name}.ts`, `${name}/index.ts`, `${name}.macro.ts`, `rules/${name}.ts`].some((module) =>
      existsSync(join(REPO_ROOT, folder, module))
    )
  )
}

describe("test files", () => {
  it("take the name of the module that they test, or name the reason in the exceptions", () => {
    const tests = globSync("{.adamantite,presets,scripts,src}/**/*.test.ts", {
      cwd: REPO_ROOT,
      exclude: ["**/node_modules/**", "src/__tests__/presets/fixtures/**"],
    }).map((file) => file.split(sep).join("/"))

    expect(
      Array.sort(
        tests.filter((test) => !hasModule(test)),
        Order.String
      )
    ).toStrictEqual(Array.sort(Object.keys(EXCEPTIONS), Order.String))
  })
})
