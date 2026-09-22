import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

tester.run("no-module-mocking", antislop.rules["no-module-mocking"], {
  invalid: [
    {
      code: "vi['doMock']('./user-store')",
      errors: [{ column: 0, line: 1, messageId: "moduleMock" }],
    },
    {
      code: "import { jest } from '@jest/globals'\njest.mock('./user-store')",
      errors: [{ column: 0, line: 2, messageId: "moduleMock" }],
    },
    {
      code: "jest.mock('./user-store')",
      errors: [{ column: 0, line: 1, messageId: "moduleMock" }],
    },
    {
      code: "jest.unstable_mockModule('./user-store')",
      errors: [{ column: 0, line: 1, messageId: "moduleMock" }],
    },
    {
      code: "vi.mock('./user-store')",
      errors: [{ column: 0, line: 1, messageId: "moduleMock" }],
    },
    {
      code: "import { vi as testApi } from 'vitest'\ntestApi.mock('./user-store')",
      errors: [{ column: 0, line: 2, messageId: "moduleMock" }],
    },
  ],
  valid: [
    "import { vi as localVi } from './helpers'\nlocalVi.mock('./module')",
    "const vi = { mock() {} }\nvi.mock()",
    "import { vi } from 'vitest'\ndeclare const store: { save(): void }\nvi.spyOn(store, 'save')",
  ],
})
