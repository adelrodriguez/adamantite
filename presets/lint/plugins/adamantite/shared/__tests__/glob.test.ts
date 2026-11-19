import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import { globToRegExp } from "#presets/lint/plugins/adamantite/shared/glob.ts"

const segment = Schema.String.check(Schema.isPattern(/^[\w$()+.^|-]{1,6}$/))
const segments = Schema.Array(segment).check(Schema.isMaxLength(4))

describe("globToRegExp", () => {
  it.each([
    { expected: true, glob: "**/use[A-Z]*.{ts,tsx}", path: "useCart.ts" },
    { expected: true, glob: "**/use[A-Z]*.{ts,tsx}", path: "src/cart/useCart.tsx" },
    { expected: false, glob: "**/use[A-Z]*.{ts,tsx}", path: "src/cart/useCart.js" },
    { expected: false, glob: "**/use[A-Z]*.{ts,tsx}", path: "src/user/Profile.tsx" },
    { expected: false, glob: "**/use[A-Z]*.{ts,tsx}", path: "src/features/userProfile.tsx" },
    { expected: true, glob: "**/use-*.{ts,tsx}", path: "src/cart/use-cart.ts" },
    { expected: false, glob: "**/use-*.{ts,tsx}", path: "src/features/user-profile.tsx" },
    { expected: true, glob: "**/hooks/**", path: "src/hooks/cart.ts" },
    { expected: true, glob: "**/hooks/**", path: "hooks/cart/index.ts" },
    { expected: false, glob: "**/hooks/**", path: "src/no-hooks/cart.ts" },
  ])("match $path against the default allow glob $glob: $expected", ({ expected, glob, path }) => {
    expect(globToRegExp(glob).test(path)).toBe(expected)
  })

  it("matches character classes and negated character classes", () => {
    expect(globToRegExp("file-[0-9].ts").test("file-7.ts")).toBe(true)
    expect(globToRegExp("file-[0-9].ts").test("file-a.ts")).toBe(false)
    expect(globToRegExp("file-[!0-9].ts").test("file-a.ts")).toBe(true)
    expect(globToRegExp("file-[!0-9].ts").test("file-7.ts")).toBe(false)
  })

  it.prop(
    "match a path without glob syntax only to itself",
    { other: segments, path: Schema.NonEmptyArray(segment) },
    ({ other, path }) => {
      const glob = globToRegExp(path.join("/"))

      expect(glob.test(path.join("/"))).toBe(true)
      expect(glob.test(other.join("/"))).toBe(other.join("/") === path.join("/"))
    }
  )

  it.prop(
    "keep a single star inside one path segment",
    { name: segment, nested: Schema.NonEmptyArray(segment) },
    ({ name, nested }) => {
      const glob = globToRegExp("src/*.ts")

      expect(glob.test(`src/${name}.ts`)).toBe(true)
      expect(glob.test(`src/${[...nested, name].join("/")}.ts`)).toBe(false)
    }
  )

  it.prop(
    "match a leading double star at any depth, including the root",
    { folders: segments, name: segment },
    ({ folders, name }) => {
      expect(globToRegExp(`**/${name}`).test([...folders, name].join("/"))).toBe(true)
    }
  )
})
