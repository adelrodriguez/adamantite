import { RuleTester } from "oxlint/plugins-dev"
import { describe, expect, it } from "vitest"
import plugin from "#presets/lint/plugin/index.ts"
import { globToRegExp } from "#presets/lint/plugin/rules/no-react-state-hooks.ts"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const CWD = "/project"

const tester = new RuleTester({
  cwd: CWD,
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

function feature(name: string) {
  return `${CWD}/src/features/${name}`
}

tester.run("no-react-state-hooks", plugin.rules["no-react-state-hooks"], {
  invalid: [
    {
      code: 'import { useState } from "react"\nexport function Counter() {\n  const [count] = useState(0)\n  return count\n}',
      errors: [{ column: 18, data: { hook: "useState" }, line: 3, messageId: "localState" }],
      filename: feature("Counter.tsx"),
    },
    {
      code: 'import { useReducer as useStore } from "react"\nexport function Cart() {\n  return useStore((state: number) => state, 0)\n}',
      errors: [{ column: 9, data: { hook: "useReducer" }, line: 3, messageId: "localState" }],
      filename: feature("Cart.tsx"),
    },
    {
      code: 'import React from "react"\nexport function Page() {\n  React.useEffect(() => {}, [])\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "effect" }],
      filename: feature("Page.tsx"),
    },
    {
      code: 'import * as React from "react"\nexport function Page() {\n  React["useLayoutEffect"](() => {}, [])\n}',
      errors: [{ column: 2, data: { hook: "useLayoutEffect" }, line: 3, messageId: "effect" }],
      filename: feature("Page.tsx"),
    },
    {
      code: 'import { useCallback, useMemo } from "react"\nexport function List() {\n  useMemo(() => 1, [])\n  useCallback(() => {}, [])\n}',
      errors: [
        { column: 2, data: { hook: "useMemo" }, line: 3, messageId: "memoization" },
        { column: 2, data: { hook: "useCallback" }, line: 4, messageId: "memoization" },
      ],
      filename: feature("List.tsx"),
    },
    {
      code: 'import { useSyncExternalStore } from "react"\nexport function Online() {\n  return useSyncExternalStore(() => () => {}, () => true)\n}',
      errors: [
        { column: 9, data: { hook: "useSyncExternalStore" }, line: 3, messageId: "externalStore" },
      ],
      filename: feature("Online.tsx"),
    },
    {
      code: 'import { useRef } from "react"\nexport function Input() {\n  return useRef(null)\n}',
      errors: [{ column: 9, data: { hook: "useRef" }, line: 3, messageId: "banned" }],
      filename: feature("Input.tsx"),
      options: [{ hooks: ["useRef"] }],
    },
    {
      code: 'import { useState } from "react"\nexport function useCounter() {\n  return useState(0)\n}',
      errors: [{ column: 9, data: { hook: "useState" }, line: 3, messageId: "localState" }],
      filename: `${CWD}/src/hooks/useCounter.ts`,
      options: [{ allow: ["src/state/**"] }],
    },
  ],
  valid: [
    {
      code: 'import { useState } from "react"\nexport function useCounter() {\n  return useState(0)\n}',
      filename: `${CWD}/src/features/useCounter.ts`,
    },
    {
      code: 'import { useEffect } from "react"\nexport function subscribe() {\n  useEffect(() => {}, [])\n}',
      filename: `${CWD}/src/hooks/subscribe.ts`,
    },
    {
      code: 'import { useState } from "react"\nexport function counter() {\n  return useState(0)\n}',
      filename: `${CWD}/src/state/counter.ts`,
      options: [{ allow: ["src/state/**"] }],
    },
    {
      code: 'import { useEffect, useState } from "react"\nexport function Page() {\n  useEffect(() => {}, [])\n  return useState(0)\n}',
      filename: feature("Page.tsx"),
      options: [{ hooks: ["useRef"] }],
    },
    {
      code: 'import { useRef, useTransition } from "react"\nexport function Form() {\n  useTransition()\n  return useRef(null)\n}',
      filename: feature("Form.tsx"),
    },
    {
      code: 'import { useState } from "preact/hooks"\nexport function Counter() {\n  return useState(0)\n}',
      filename: feature("Counter.tsx"),
    },
    {
      code: "function useState(initial: number) {\n  return [initial]\n}\nexport function Counter() {\n  return useState(0)\n}",
      filename: feature("Counter.tsx"),
    },
    {
      code: 'import { useState } from "react"\nexport function Counter() {\n  const useState = (initial: number) => [initial]\n  return useState(0)\n}',
      filename: feature("Counter.tsx"),
    },
    {
      code: 'import type { useState } from "react"\nexport type Setter = ReturnType<typeof useState<number>>[1]',
      filename: feature("types.ts"),
    },
  ],
})

describe("globToRegExp", () => {
  it("matches the default allow globs", () => {
    const hookModule = globToRegExp("**/use*.{ts,tsx}")
    const hooksDirectory = globToRegExp("**/hooks/**")

    expect(hookModule.test("useCart.ts")).toBe(true)
    expect(hookModule.test("src/cart/useCart.tsx")).toBe(true)
    expect(hookModule.test("src/cart/useCart.js")).toBe(false)
    expect(hookModule.test("src/user/Profile.tsx")).toBe(false)
    expect(hooksDirectory.test("src/hooks/cart.ts")).toBe(true)
    expect(hooksDirectory.test("hooks/cart/index.ts")).toBe(true)
    expect(hooksDirectory.test("src/no-hooks/cart.ts")).toBe(false)
  })

  it("keeps a single star inside one path segment", () => {
    const glob = globToRegExp("src/*.ts")

    expect(glob.test("src/index.ts")).toBe(true)
    expect(glob.test("src/nested/index.ts")).toBe(false)
  })
})
