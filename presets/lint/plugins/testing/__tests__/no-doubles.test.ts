import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/testing/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "moduleMock" }
const replacement = { messageId: "replacement" }

tester.run("no-doubles", plugin.rules["no-doubles"], {
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
    { code: "vi.importMock('./user-store');", errors: [error] },
    { code: "vi.mockObject(store);", errors: [error] },
    { code: "jest.createMockFromModule('./user-store');", errors: [error] },
    { code: "jest.genMockFromModule('./user-store');", errors: [error] },
    { code: "jest.setMock('./user-store', store);", errors: [error] },
    { code: "jest.enableAutomock();", errors: [error] },
    { code: "vi.stubGlobal('fetch', fakeFetch);", errors: [replacement] },
    { code: "vi.when(spy).calledWith(1).thenReturn(2);", errors: [replacement] },
    { code: "jest.replaceProperty(process, 'platform', 'win32');", errors: [replacement] },
    {
      code: "import { vi } from 'vitest'; const { stubGlobal } = vi; stubGlobal('fetch', fakeFetch);",
      errors: [replacement],
      name: "stubGlobal destructured from an import of vi",
    },
    { code: "vi.fn(() => 42);", errors: [replacement] },
    { code: "jest.fn(async () => ({ id: 1 }));", errors: [replacement] },
    {
      code: "import * as vitest from 'vitest'; vitest.vi.fn(load);",
      errors: [replacement],
      name: "an implementation through a namespace import",
    },
    { code: "vi.spyOn(store, 'save').mockImplementation(() => undefined);", errors: [replacement] },
    { code: "vi.spyOn(store, 'load').mockResolvedValue({ id: 1 });", errors: [replacement] },
    { code: "save.mockReturnValue(1);", errors: [replacement] },
    { code: "save.mockReturnValueOnce(1);", errors: [replacement] },
    { code: "save.mockImplementationOnce(() => 1);", errors: [replacement] },
    { code: "load.mockRejectedValue(new Error('down'));", errors: [replacement] },
    { code: "load.mockRejectedValueOnce(new Error('down'));", errors: [replacement] },
    { code: "load.mockResolvedValueOnce(1);", errors: [replacement] },
    { code: "builder.mockReturnThis();", errors: [replacement] },
    {
      code: "const save = vi.fn(); save.withImplementation(() => 1, run);",
      errors: [replacement],
    },
    {
      code: "vi.spyOn(store, 'save').withImplementation(() => 1, run);",
      errors: [replacement],
    },
    { code: "save['mockReturnValue'](1);", errors: [replacement], name: "computed method name" },
  ],
  valid: [
    "const store = new InMemoryUserStore();",
    "const save = vi.fn();",
    "const save = jest.fn(undefined);",
    "const save = vi.spyOn(store, 'save'); expect(save).toHaveBeenCalledOnce();",
    "vi.useFakeTimers();",
    "vi.stubEnv('NODE_ENV', 'test');",
    {
      code: "client.withImplementation(strategy, run);",
      name: "a withImplementation method of another object",
    },
    "const when = (spy) => spy; when(save);",
    "const fn = { fn() {} }; fn.fn(() => 1);",
    {
      code: "it.effect('loads', () => load.pipe(Effect.provide(Layer.succeed(Store, testStore))));",
      name: "a test implementation through an Effect layer",
    },
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
