import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

new RuleTester().run(
  "no-service-constructor-imports",
  plugin.rules["no-service-constructor-imports"],
  {
    valid: [
      {
        filename: "src/issue-service.test.ts",
        code: 'import { makeIssueService } from "./issue-service.ts";',
      },
      {
        filename: "src/issue-service.spec.tsx",
        code: 'import { makeIssueService } from "../issue-service.ts";',
      },
      {
        filename: "src/runtime.ts",
        code: 'import { makeExecutionMemo } from "alchemy/Runtime/ExecutionMemo";',
      },
      {
        filename: "src/runtime.ts",
        code: 'import { issueServiceLayer } from "./issue-service.ts";\nWorkspaceName.make("name");',
      },
      {
        filename: "src/runtime.ts",
        code: 'import { makeissueService } from "./issue-service.ts";',
      },
    ],
    invalid: [
      {
        filename: "src/runtime.ts",
        code: 'import { makeIssueService } from "./issue-service.ts";',
        errors: [
          {
            messageId: "serviceConstructorImport",
            data: { name: "makeIssueService" },
          },
        ],
        output: null,
      },
      {
        filename: "src/runtime.ts",
        code: 'import { makeIssueService as createIssueService } from "../issue-service.ts";',
        errors: [
          {
            messageId: "serviceConstructorImport",
            data: { name: "makeIssueService" },
          },
        ],
        output: null,
      },
    ],
  }
)
