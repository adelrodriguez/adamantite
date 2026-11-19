import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/adamantite/index.ts"

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
      code: 'import * as React from "react"\nexport function Counter() {\n  return React[`useState`](0)[0]\n}',
      errors: [{ data: { hook: "useState" }, messageId: "localState" }],
      filename: feature("Counter.tsx"),
      name: "report useState through a template literal key of a namespace import",
    },
    {
      code: 'import { useState } from "react"\nexport function Counter() {\n  const [count] = useState(0)\n  return count\n}',
      errors: [{ column: 18, data: { hook: "useState" }, line: 3, messageId: "localState" }],
      filename: feature("Counter.tsx"),
      name: "report useState in a feature component",
    },
    {
      code: 'import { useReducer as useStore } from "react"\nexport function Cart() {\n  return useStore((state: number) => state, 0)\n}',
      errors: [{ column: 9, data: { hook: "useReducer" }, line: 3, messageId: "localState" }],
      filename: feature("Cart.tsx"),
      name: "report a renamed useReducer",
    },
    {
      code: 'import React from "react"\nexport function Page() {\n  React.useEffect(() => {}, [])\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "effect" }],
      filename: feature("Page.tsx"),
      name: "report React.useEffect from a default import",
    },
    {
      code: 'import * as React from "react"\nexport function Page() {\n  React["useLayoutEffect"](() => {}, [])\n}',
      errors: [{ column: 2, data: { hook: "useLayoutEffect" }, line: 3, messageId: "effect" }],
      filename: feature("Page.tsx"),
      name: "report useLayoutEffect through a string key of a namespace import",
    },
    {
      code: 'import { useCallback, useMemo } from "react"\nexport function List() {\n  useMemo(() => 1, [])\n  useCallback(() => {}, [])\n}',
      errors: [
        { column: 2, data: { hook: "useMemo" }, line: 3, messageId: "memoization" },
        { column: 2, data: { hook: "useCallback" }, line: 4, messageId: "memoization" },
      ],
      filename: feature("List.tsx"),
      name: "report useMemo and useCallback",
    },
    {
      code: 'import { useSyncExternalStore } from "react"\nexport function Online() {\n  return useSyncExternalStore(() => () => {}, () => true)\n}',
      errors: [
        { column: 9, data: { hook: "useSyncExternalStore" }, line: 3, messageId: "externalStore" },
      ],
      filename: feature("Online.tsx"),
      name: "report useSyncExternalStore",
    },
    {
      code: 'import { useRef } from "react"\nexport function Input() {\n  return useRef(null)\n}',
      errors: [{ column: 9, data: { hook: "useRef" }, line: 3, messageId: "banned" }],
      filename: feature("Input.tsx"),
      name: "report a hook that the hooks option lists",
      options: [{ hooks: ["useRef"] }],
    },
    {
      code: 'import { useState } from "react"\nexport function useCounter() {\n  return useState(0)\n}',
      errors: [{ column: 9, data: { hook: "useState" }, line: 3, messageId: "localState" }],
      filename: `${CWD}/src/hooks/useCounter.ts`,
      name: "report a hooks folder that the allow option replaces",
      options: [{ allow: ["src/state/**"] }],
    },
    {
      code: 'import { useState } from "react"\nexport function UserProfile() {\n  return useState(0)\n}',
      errors: [{ column: 9, data: { hook: "useState" }, line: 3, messageId: "localState" }],
      filename: feature("userProfile.tsx"),
      name: "report useState in a camel-case component file",
    },
    {
      code: 'import { useState } from "react"\nexport function useCounter() {\n  return useState(0)\n}',
      errors: [{ column: 9, data: { hook: "useState" }, line: 3, messageId: "localState" }],
      filename: `${CWD}/src/features/useCounter.ts`,
      name: "report useState in a camel-case hook file outside a hooks folder",
    },
  ],
  valid: [
    {
      code: 'import { useState } from "react"\nexport function useCart() {\n  return useState(0)\n}',
      filename: `${CWD}/src/features/use-cart.ts`,
      name: "accept useState in a use- file",
    },
    {
      code: 'import { useEffect } from "react"\nexport function subscribe() {\n  useEffect(() => {}, [])\n}',
      filename: `${CWD}/src/hooks/subscribe.ts`,
      name: "accept useEffect in a hooks folder",
    },
    {
      code: 'import { useState } from "react"\nexport function useCart() {\n  return useState(0)\n}',
      filename: `${CWD}/src/features/cart/hooks.ts`,
      name: "accept useState in a hooks file",
    },
    {
      code: 'import { useState } from "react"\nexport function counter() {\n  return useState(0)\n}',
      filename: `${CWD}/src/state/counter.ts`,
      name: "accept useState in a path that the allow option lists",
      options: [{ allow: ["src/state/**"] }],
    },
    {
      code: 'import { useEffect, useState } from "react"\nexport function Page() {\n  useEffect(() => {}, [])\n  return useState(0)\n}',
      filename: feature("Page.tsx"),
      name: "accept hooks that the hooks option does not list",
      options: [{ hooks: ["useRef"] }],
    },
    {
      code: 'import { useRef, useTransition } from "react"\nexport function Form() {\n  useTransition()\n  return useRef(null)\n}',
      filename: feature("Form.tsx"),
      name: "accept React hooks that the rule does not ban",
    },
    {
      code: 'import { useState } from "preact/hooks"\nexport function Counter() {\n  return useState(0)\n}',
      filename: feature("Counter.tsx"),
      name: "accept useState from preact",
    },
    {
      code: "function useState(initial: number) {\n  return [initial]\n}\nexport function Counter() {\n  return useState(0)\n}",
      filename: feature("Counter.tsx"),
      name: "accept a local function named useState",
    },
    {
      code: 'import { useState } from "react"\nexport function Counter() {\n  const useState = (initial: number) => [initial]\n  return useState(0)\n}',
      filename: feature("Counter.tsx"),
      name: "accept a local binding that shadows the useState import",
    },
    {
      code: 'import type { useState } from "react"\nexport type Setter = ReturnType<typeof useState<number>>[1]',
      filename: feature("types.ts"),
      name: "accept a type-only import of useState",
    },
  ],
})
