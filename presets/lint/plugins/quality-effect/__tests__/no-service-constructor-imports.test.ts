import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("no-service-constructor-imports", plugin.rules["no-service-constructor-imports"], {
  invalid: [
    {
      code: 'import { makeIssueService } from "./issue-service.ts";',
      errors: [
        {
          data: { name: "makeIssueService" },
          messageId: "serviceConstructorImport",
        },
      ],
      filename: "src/runtime.ts",
      name: "report a service constructor import in a runtime file",
      output: null,
    },
    {
      code: 'import { makeIssueService as createIssueService } from "../issue-service.ts";',
      errors: [
        {
          data: { name: "makeIssueService" },
          messageId: "serviceConstructorImport",
        },
      ],
      filename: "src/runtime.ts",
      name: "report a renamed service constructor import",
      output: null,
    },
  ],
  valid: [
    {
      code: 'import { makeIssueService } from "./issue-service.ts";',
      filename: "src/issue-service.test.ts",
      name: "accept a service constructor import in a test file",
    },
    {
      code: 'import { makeIssueService } from "../issue-service.ts";',
      filename: "src/issue-service.spec.tsx",
      name: "accept a service constructor import in a spec file",
    },
    {
      code: 'import { makeExecutionMemo } from "alchemy/Runtime/ExecutionMemo";',
      filename: "src/runtime.ts",
      name: "accept a make import whose name does not end in Service",
    },
    {
      code: 'import { issueServiceLayer } from "./issue-service.ts";\nWorkspaceName.make("name");',
      filename: "src/runtime.ts",
      name: "accept a layer import and a make call on a schema",
    },
    {
      code: 'import { makeissueService } from "./issue-service.ts";',
      filename: "src/runtime.ts",
      name: "accept a make import whose next letter is lowercase",
    },
  ],
})
