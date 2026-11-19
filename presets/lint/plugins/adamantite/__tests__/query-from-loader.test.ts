import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/adamantite/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

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
      name: "report a plain object in useQuery",
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
      name: "report queryOptions built inside the component",
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
      name: "report a local plain object binding",
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
      name: "report a local queryOptions binding",
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
      name: "report a module plain object binding",
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
      name: "report a renamed useSuspenseQuery with a plain object",
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
      name: "report useInfiniteQuery from a namespace import",
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
      name: "report a local plain object binding under as const",
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
      name: "report a plain object under satisfies",
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
      name: "report a local queryOptions binding under satisfies",
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
      name: "report a plain object in a root route",
    },
  ],
  valid: [
    {
      code: 'import { useQuery } from "@tanstack/react-query"\nexport function User() {\n  return useQuery({ queryFn: fetchUser, queryKey: ["user"] })\n}',
      name: "accept useQuery outside a route file",
    },
    {
      code: 'import type { createFileRoute } from "@tanstack/react-router"\nimport { useQuery } from "@tanstack/react-query"\nexport function User() {\n  return useQuery({ queryFn: fetchUser, queryKey: ["user"] })\n}',
      name: "accept useQuery beside a type-only router import",
    },
    {
      code: 'import { Link } from "@tanstack/react-router"\nimport { useQuery } from "@tanstack/react-query"\nexport function User() {\n  useQuery({ queryFn: fetchUser, queryKey: ["user"] })\n  return <Link to="/" />\n}',
      name: "accept useQuery beside a router import that defines no route",
    },
    {
      code: `${IMPORT}const userQuery = queryOptions({ queryFn: fetchUser, queryKey: ["user"] }) satisfies Options\nexport function User() {\n  return useQuery(userQuery)\n}${ROUTE}`,
      name: "accept module query options under satisfies",
    },
    {
      code: `${IMPORT}const userQuery = queryOptions({ queryFn: fetchUser, queryKey: ["user"] })\nexport function User() {\n  return useQuery(userQuery)\n}${ROUTE}`,
      name: "accept module query options",
    },
    {
      code: `${IMPORT}export function User({ id }: { id: string }) {\n  return useQuery(userQuery(id))\n}${ROUTE}`,
      name: "accept a query options factory call",
    },
    {
      code: `${IMPORT}export function User({ id }: { id: string }) {\n  const options = userQuery(id)\n  return useQuery(options)\n}${ROUTE}`,
      name: "accept a local binding of a query options factory call",
    },
    {
      code: `${IMPORT}export function User({ id }: { id: string }) {\n  return useQuery({ ...userQuery(id), select: (user) => user.name })\n}${ROUTE}`,
      name: "accept a spread of a query options factory call with a select",
    },
    {
      code: `${IMPORT}export function User() {\n  return useQuery(queries.user)\n}${ROUTE}`,
      name: "accept a member of a query options object",
    },
    {
      code: `${IMPORT}export function User({ options }: { options: Options }) {\n  return useQuery(options)\n}${ROUTE}`,
      name: "accept query options from a prop",
    },
    {
      code: 'import { useQuery } from "./query"\nexport function User() {\n  return useQuery({ queryKey: ["user"] })\n}',
      name: "accept a local useQuery hook",
    },
    {
      code: 'import type { useQuery } from "@tanstack/react-query"\nexport function User() {\n  return useQuery({ queryKey: ["user"] })\n}',
      name: "accept a type-only useQuery import",
    },
  ],
})
