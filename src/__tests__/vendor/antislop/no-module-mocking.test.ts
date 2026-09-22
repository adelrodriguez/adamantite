import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

testVendoredRule(antislop, "no-module-mocking", {
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
