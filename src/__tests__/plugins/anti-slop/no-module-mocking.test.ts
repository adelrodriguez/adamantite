import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/anti-slop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "moduleMock" }

tester.run("no-module-mocking", plugin.rules["no-module-mocking"], {
  invalid: [
    { code: "vi.mock('./user-store');", errors: [error] },
    { code: "jest.mock('./user-store');", errors: [error] },
    { code: "vi['doMock']('./user-store');", errors: [error] },
    { code: "jest.unstable_mockModule('./user-store');", errors: [error] },
    { code: "import { vi } from 'vitest'; vi.mock('./user-store');", errors: [error] },
    {
      code: "import { vi as testApi } from 'vitest'; testApi.mock('./user-store');",
      errors: [error],
    },
    {
      code: "import { jest } from '@jest/globals'; jest.mock('./user-store');",
      errors: [error],
    },
    {
      code: "import * as vitest from 'vitest'; vitest.vi.mock('./user-store');",
      errors: [error],
      name: "vi read from a namespace import of vitest",
    },
    {
      code: "import * as globals from '@jest/globals'; globals.jest.mock('./user-store');",
      errors: [error],
      name: "jest read from a namespace import of @jest/globals",
    },
    {
      code: "import * as vitest from 'vitest'; vitest['vi'].doMock('./user-store');",
      errors: [error],
      name: "vi read with a computed key from a namespace import",
    },
    {
      code: "const { doMock } = vi; doMock('./user-store', () => ({}));",
      errors: [error],
      name: "method destructured from the vi global",
    },
    {
      code: "import { vi } from 'vitest'; const { mock: mockModule } = vi; mockModule('./user-store');",
      errors: [error],
      name: "method destructured from an import under another name",
    },
    {
      code: "import * as vitest from 'vitest'; const { mock } = vitest.vi; mock('./user-store');",
      errors: [error],
      name: "method destructured from a namespace import",
    },
    {
      code: "const mockModule = vi.mock; mockModule('./user-store');",
      errors: [error],
      name: "constant alias of the method",
    },
    {
      code: "const testApi = vi; testApi.mock('./user-store');",
      errors: [error],
      name: "constant alias of vi",
    },
    {
      code: "globalThis.vi.mock('./user-store');",
      errors: [error],
      name: "vi read from globalThis",
    },
  ],
  valid: [
    "const store = new InMemoryUserStore();",
    "vi.spyOn(store, 'save');",
    "const vi = { mock() {} }; vi.mock();",
    "function test(jest: { mock(): void }) { jest.mock(); }",
    "import { vi as localVi } from './helpers'; localVi.mock('./module');",
    {
      code: "import * as helpers from './helpers'; helpers.vi.mock('./module');",
      name: "namespace import of a local module",
    },
    {
      code: "import * as vitest from 'vitest'; vitest.vi.spyOn(store, 'save');",
      name: "spy through a namespace import",
    },
    {
      code: "const { spyOn } = vi; spyOn(store, 'save');",
      name: "spy destructured from vi",
    },
    {
      code: "const { doMock } = registry; doMock('./module');",
      name: "method destructured from another object",
    },
    {
      code: "const { doMock } = vi; function run(doMock) { doMock('./module'); }",
      name: "parameter that shadows the destructured method",
    },
    {
      code: "const vi = { mock() {} }; const { mock } = vi; mock();",
      name: "method destructured from a local object named vi",
    },
    {
      code: "let { mock } = vi; mock = registry.mock; mock('./module');",
      name: "variable that the code reassigns",
    },
  ],
})
