import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/index.ts"

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
      code: `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  const [name] = useState(query.data)\n  return name\n}`,
      errors: [{ column: 17, data: { hook: "useState" }, line: 5, messageId: "copiedData" }],
    },
    {
      code: `${IMPORTS}export function Name() {\n  const { data } = useQuery(userQuery)\n  const [name] = useState(data?.user.name ?? "")\n  return name\n}`,
      errors: [{ column: 17, data: { hook: "useState" }, line: 5, messageId: "copiedData" }],
    },
    {
      code: `${IMPORTS}export function Name() {\n  const { data: user } = useQuery(userQuery)\n  const [draft] = useState(() => user)\n  return draft\n}`,
      errors: [{ column: 18, data: { hook: "useState" }, line: 5, messageId: "copiedData" }],
    },
    {
      code: 'import * as React from "react"\nimport { useSuspenseQuery } from "@tanstack/react-query"\nexport function Name() {\n  const query = useSuspenseQuery(userQuery)\n  const [name] = React.useState(query.data.name)\n  return name\n}',
      errors: [{ column: 17, data: { hook: "useState" }, line: 5, messageId: "copiedData" }],
    },
  ],
  valid: [
    `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  return query.data?.name\n}`,
    `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  const [open] = useState(false)\n  return open ? query.data : undefined\n}`,
    `${IMPORTS}export function Name() {\n  const { data, status } = useQuery(userQuery)\n  const [name] = useState(status)\n  return [data, name]\n}`,
    `${IMPORTS}export function Name({ data }: { data: string }) {\n  useQuery(userQuery)\n  const [name] = useState(data)\n  return name\n}`,
    `${IMPORTS}export function Name() {\n  const query = useQuery(userQuery)\n  const [draft] = useState(() => {\n    return query.data\n  })\n  return draft\n}`,
  ],
})
