import { describe, expect, it } from "vitest"
import { globToRegExp } from "#presets/lint/plugin/glob.ts"

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

  it("keeps a single star inside one path segment", () => {
    const glob = globToRegExp("src/*.ts")

    expect(glob.test("src/index.ts")).toBe(true)
    expect(glob.test("src/nested/index.ts")).toBe(false)
  })
})
