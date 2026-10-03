import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/index.ts"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

// The router import stays on the first line, and the route definition comes last, so the report
// lines and columns match the component code.
const ROUTER = 'import { createFileRoute } from "@tanstack/react-router"; '
const ROUTE = '\nexport const Route = createFileRoute("/user")({ component: User })'
const IMPORT = `${ROUTER}import { queryOptions, useQuery } from "@tanstack/react-query"\n`

tester.run("query-from-loader", plugin.rules["query-from-loader"], {
  invalid: [
    {
      code: `${IMPORT}export function User() {\n  return useQuery({ queryFn: fetchUser, queryKey: ["user"] })\n}${ROUTE}`,
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 3,
          messageId: "plainObject",
        },
      ],
    },
    {
      code: `${IMPORT}export function User() {\n  return useQuery(queryOptions({ queryFn: fetchUser, queryKey: ["user"] }))\n}${ROUTE}`,
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 3,
          messageId: "localOptions",
        },
      ],
    },
    {
      code: `${IMPORT}export function User() {\n  const options = { queryFn: fetchUser, queryKey: ["user"] }\n  return useQuery(options)\n}${ROUTE}`,
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 4,
          messageId: "plainObject",
        },
      ],
    },
    {
      code: `${IMPORT}export function User() {\n  const options = queryOptions({ queryFn: fetchUser, queryKey: ["user"] })\n  return useQuery(options)\n}${ROUTE}`,
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 4,
          messageId: "localOptions",
        },
      ],
    },
    {
      code: `${IMPORT}const userQuery = { queryFn: fetchUser, queryKey: ["user"] }\nexport function User() {\n  return useQuery(userQuery)\n}${ROUTE}`,
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 4,
          messageId: "plainObject",
        },
      ],
    },
    {
      code: `${ROUTER}import { useSuspenseQuery as useData } from "@tanstack/react-query"\nexport function User() {\n  return useData({ queryFn: fetchUser, queryKey: ["user"] })\n}${ROUTE}`,
      errors: [
        {
          column: 17,
          data: { factory: "queryOptions", hook: "useSuspenseQuery", preload: "ensureQueryData" },
          line: 3,
          messageId: "plainObject",
        },
      ],
    },
    {
      code: `${ROUTER}import * as Query from "@tanstack/react-query"\nexport function Users() {\n  return Query.useInfiniteQuery({ queryFn: fetchUsers, queryKey: ["users"] })\n}${ROUTE}`,
      errors: [
        {
          column: 32,
          data: {
            factory: "infiniteQueryOptions",
            hook: "useInfiniteQuery",
            preload: "ensureInfiniteQueryData",
          },
          line: 3,
          messageId: "plainObject",
        },
      ],
    },
    {
      code: `${IMPORT}export function User() {\n  const options = { queryFn: fetchUser, queryKey: ["user"] } as const\n  return useQuery(options)\n}${ROUTE}`,
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 4,
          messageId: "plainObject",
        },
      ],
    },
    {
      code: `${IMPORT}export function User() {\n  return useQuery({ queryFn: fetchUser, queryKey: ["user"] } satisfies Options)\n}${ROUTE}`,
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 3,
          messageId: "plainObject",
        },
      ],
    },
    {
      code: `${IMPORT}export function User() {\n  const options = queryOptions({ queryFn: fetchUser, queryKey: ["user"] }) satisfies Options\n  return useQuery(options)\n}${ROUTE}`,
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 4,
          messageId: "localOptions",
        },
      ],
    },
    {
      code: 'import { createRootRouteWithContext } from "@tanstack/react-router"; import { useQuery } from "@tanstack/react-query"\nfunction Root() {\n  return useQuery({ queryFn: fetchSession, queryKey: ["session"] })\n}\nexport const Route = createRootRouteWithContext<Context>()({ component: Root })',
      errors: [
        {
          column: 18,
          data: { factory: "queryOptions", hook: "useQuery", preload: "ensureQueryData" },
          line: 3,
          messageId: "plainObject",
        },
      ],
    },
  ],
  valid: [
    // Not a route file: no route factory from @tanstack/react-router.
    'import { useQuery } from "@tanstack/react-query"\nexport function User() {\n  return useQuery({ queryFn: fetchUser, queryKey: ["user"] })\n}',
    'import type { createFileRoute } from "@tanstack/react-router"\nimport { useQuery } from "@tanstack/react-query"\nexport function User() {\n  return useQuery({ queryFn: fetchUser, queryKey: ["user"] })\n}',
    'import { Link } from "@tanstack/react-router"\nimport { useQuery } from "@tanstack/react-query"\nexport function User() {\n  useQuery({ queryFn: fetchUser, queryKey: ["user"] })\n  return <Link to="/" />\n}',
    `${IMPORT}const userQuery = queryOptions({ queryFn: fetchUser, queryKey: ["user"] }) satisfies Options\nexport function User() {\n  return useQuery(userQuery)\n}${ROUTE}`,
    `${IMPORT}const userQuery = queryOptions({ queryFn: fetchUser, queryKey: ["user"] })\nexport function User() {\n  return useQuery(userQuery)\n}${ROUTE}`,
    `${IMPORT}export function User({ id }: { id: string }) {\n  return useQuery(userQuery(id))\n}${ROUTE}`,
    `${IMPORT}export function User({ id }: { id: string }) {\n  const options = userQuery(id)\n  return useQuery(options)\n}${ROUTE}`,
    `${IMPORT}export function User({ id }: { id: string }) {\n  return useQuery({ ...userQuery(id), select: (user) => user.name })\n}${ROUTE}`,
    `${IMPORT}export function User() {\n  return useQuery(queries.user)\n}${ROUTE}`,
    `${IMPORT}export function User({ options }: { options: Options }) {\n  return useQuery(options)\n}${ROUTE}`,
    'import { useQuery } from "./query"\nexport function User() {\n  return useQuery({ queryKey: ["user"] })\n}',
    'import type { useQuery } from "@tanstack/react-query"\nexport function User() {\n  return useQuery({ queryKey: ["user"] })\n}',
  ],
})
