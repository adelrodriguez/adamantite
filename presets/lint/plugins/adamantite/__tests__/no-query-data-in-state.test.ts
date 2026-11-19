import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/adamantite/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

const IMPORTS =
  'import { useState } from "react"\nimport { useQuery } from "@tanstack/react-query"\n'

tester.run("no-query-data-in-state", plugin.rules["no-query-data-in-state"], {
  invalid: [
    {
      code: `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  const [name] = useState(query[\`data\`])\n  return name\n}`,
      errors: [{ data: { hook: "useState" }, messageId: "copiedData" }],
      name: "report query data read through a template literal key",
    },
    {
      code: `${IMPORTS}export function Name() {\n  const { ["data"]: user } = useQuery(userQuery)\n  const [draft] = useState(user)\n  return draft\n}`,
      errors: [{ data: { hook: "useState" }, messageId: "copiedData" }],
      name: "report query data destructured through a string key",
    },
    {
      code: `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  const [name] = useState(query.data)\n  return name\n}`,
      errors: [{ column: 17, data: { hook: "useState" }, line: 5, messageId: "copiedData" }],
      name: "report query data passed to useState",
    },
    {
      code: `${IMPORTS}export function Name() {\n  const { data } = useQuery(userQuery)\n  const [name] = useState(data?.user.name ?? "")\n  return name\n}`,
      errors: [{ column: 17, data: { hook: "useState" }, line: 5, messageId: "copiedData" }],
      name: "report a value derived from destructured query data",
    },
    {
      code: `${IMPORTS}export function Name() {\n  const { data: user } = useQuery(userQuery)\n  const [draft] = useState(() => user)\n  return draft\n}`,
      errors: [{ column: 18, data: { hook: "useState" }, line: 5, messageId: "copiedData" }],
      name: "report query data returned by a state initializer arrow",
    },
    {
      code: 'import * as React from "react"\nimport { useSuspenseQuery } from "@tanstack/react-query"\nexport function Name() {\n  const query = useSuspenseQuery(userQuery)\n  const [name] = React.useState(query.data.name)\n  return name\n}',
      errors: [{ column: 17, data: { hook: "useState" }, line: 5, messageId: "copiedData" }],
      name: "report suspense query data passed to React.useState",
    },
  ],
  valid: [
    {
      code: `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  return query.data?.name\n}`,
      name: "accept query data read during render",
    },
    {
      code: `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  const [open] = useState(false)\n  return open ? query.data : undefined\n}`,
      name: "accept state that does not come from query data",
    },
    {
      code: `${IMPORTS}export function Name() {\n  const { data, status } = useQuery(userQuery)\n  const [name] = useState(status)\n  return [data, name]\n}`,
      name: "accept state copied from the query status",
    },
    {
      code: `${IMPORTS}export function Name({ data }: { data: string }) {\n  useQuery(userQuery)\n  const [name] = useState(data)\n  return name\n}`,
      name: "accept state copied from a prop named data",
    },
    {
      code: `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  const [draft] = useState(() => {\n    return query.data\n  })\n  return draft\n}`,
      name: "accept a state initializer function with a block body",
    },
  ],
})
