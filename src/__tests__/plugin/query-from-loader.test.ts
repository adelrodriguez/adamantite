import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/index.ts"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

const IMPORT = 'import { queryOptions, useQuery } from "@tanstack/react-query"\n'

tester.run("query-from-loader", plugin.rules["query-from-loader"], {
  invalid: [
    {
      code: `${IMPORT}export function User() {\n  return useQuery({ queryFn: fetchUser, queryKey: ["user"] })\n}`,
      errors: [{ column: 18, data: { hook: "useQuery" }, line: 3, messageId: "plainObject" }],
    },
    {
      code: `${IMPORT}export function User() {\n  return useQuery(queryOptions({ queryFn: fetchUser, queryKey: ["user"] }))\n}`,
      errors: [{ column: 18, data: { hook: "useQuery" }, line: 3, messageId: "localOptions" }],
    },
    {
      code: `${IMPORT}export function User() {\n  const options = { queryFn: fetchUser, queryKey: ["user"] }\n  return useQuery(options)\n}`,
      errors: [{ column: 18, data: { hook: "useQuery" }, line: 4, messageId: "plainObject" }],
    },
    {
      code: `${IMPORT}export function User() {\n  const options = queryOptions({ queryFn: fetchUser, queryKey: ["user"] })\n  return useQuery(options)\n}`,
      errors: [{ column: 18, data: { hook: "useQuery" }, line: 4, messageId: "localOptions" }],
    },
    {
      code: `${IMPORT}const userQuery = { queryFn: fetchUser, queryKey: ["user"] }\nexport function User() {\n  return useQuery(userQuery)\n}`,
      errors: [{ column: 18, data: { hook: "useQuery" }, line: 4, messageId: "plainObject" }],
    },
    {
      code: 'import { useSuspenseQuery as useData } from "@tanstack/react-query"\nexport function User() {\n  return useData({ queryFn: fetchUser, queryKey: ["user"] })\n}',
      errors: [
        { column: 17, data: { hook: "useSuspenseQuery" }, line: 3, messageId: "plainObject" },
      ],
    },
    {
      code: 'import * as Query from "@tanstack/react-query"\nexport function Users() {\n  return Query.useInfiniteQuery({ queryFn: fetchUsers, queryKey: ["users"] })\n}',
      errors: [
        { column: 32, data: { hook: "useInfiniteQuery" }, line: 3, messageId: "plainObject" },
      ],
    },
  ],
  valid: [
    `${IMPORT}const userQuery = queryOptions({ queryFn: fetchUser, queryKey: ["user"] })\nexport function User() {\n  return useQuery(userQuery)\n}`,
    `${IMPORT}export function User({ id }: { id: string }) {\n  return useQuery(userQuery(id))\n}`,
    `${IMPORT}export function User({ id }: { id: string }) {\n  const options = userQuery(id)\n  return useQuery(options)\n}`,
    `${IMPORT}export function User({ id }: { id: string }) {\n  return useQuery({ ...userQuery(id), select: (user) => user.name })\n}`,
    `${IMPORT}export function User() {\n  return useQuery(queries.user)\n}`,
    `${IMPORT}export function User({ options }: { options: Options }) {\n  return useQuery(options)\n}`,
    'import { useQuery } from "./query"\nexport function User() {\n  return useQuery({ queryKey: ["user"] })\n}',
    'import type { useQuery } from "@tanstack/react-query"\nexport function User() {\n  return useQuery({ queryKey: ["user"] })\n}',
  ],
})
