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
    { code: "vi.mock('./user-store');", errors: [error], name: "report vi.mock" },
    { code: "jest.mock('./user-store');", errors: [error], name: "report jest.mock" },
    {
      code: "vi['doMock']('./user-store');",
      errors: [error],
      name: "report vi.doMock through a string key",
    },
    {
      code: "jest.unstable_mockModule('./user-store');",
      errors: [error],
      name: "report jest.unstable_mockModule",
    },
    {
      code: "import { vi } from 'vitest'; vi.mock('./user-store');",
      errors: [error],
      name: "report vi.mock from an import of vitest",
    },
    {
      code: "import { vi as testApi } from 'vitest'; testApi.mock('./user-store');",
      errors: [error],
      name: "report a renamed vi import",
    },
    {
      code: "import { jest } from '@jest/globals'; jest.mock('./user-store');",
      errors: [error],
      name: "report jest.mock from an import of @jest/globals",
    },
    {
      code: "import * as vitest from 'vitest'; vitest.vi.mock('./user-store');",
      errors: [error],
      name: "report vi read from a namespace import of vitest",
    },
    {
      code: "import * as globals from '@jest/globals'; globals.jest.mock('./user-store');",
      errors: [error],
      name: "report jest read from a namespace import of @jest/globals",
    },
    {
      code: "import * as vitest from 'vitest'; vitest['vi'].doMock('./user-store');",
      errors: [error],
      name: "report vi read with a computed key from a namespace import",
    },
    {
      code: "const { doMock } = vi; doMock('./user-store', () => ({}));",
      errors: [error],
      name: "report a method destructured from the vi global",
    },
    {
      code: "import { vi } from 'vitest'; const { mock: mockModule } = vi; mockModule('./user-store');",
      errors: [error],
      name: "report a method destructured from an import under another name",
    },
    {
      code: "import * as vitest from 'vitest'; const { mock } = vitest.vi; mock('./user-store');",
      errors: [error],
      name: "report a method destructured from a namespace import",
    },
    {
      code: "const mockModule = vi.mock; mockModule('./user-store');",
      errors: [error],
      name: "report a constant alias of the method",
    },
    {
      code: "const testApi = vi; testApi.mock('./user-store');",
      errors: [error],
      name: "report a constant alias of vi",
    },
    {
      code: "globalThis.vi.mock('./user-store');",
      errors: [error],
      name: "report vi read from globalThis",
    },
    { code: "vi.importMock('./user-store');", errors: [error], name: "report vi.importMock" },
    { code: "vi.mockObject(store);", errors: [error], name: "report vi.mockObject" },
    {
      code: "jest.createMockFromModule('./user-store');",
      errors: [error],
      name: "report jest.createMockFromModule",
    },
    {
      code: "jest.genMockFromModule('./user-store');",
      errors: [error],
      name: "report jest.genMockFromModule",
    },
    { code: "jest.setMock('./user-store', store);", errors: [error], name: "report jest.setMock" },
    { code: "jest.enableAutomock();", errors: [error], name: "report jest.enableAutomock" },
    {
      code: "vi.stubGlobal('fetch', fakeFetch);",
      errors: [replacement],
      name: "report vi.stubGlobal with a replacement",
    },
    {
      code: "vi.when(spy).calledWith(1).thenReturn(2);",
      errors: [replacement],
      name: "report vi.when with a replacement",
    },
    {
      code: "jest.replaceProperty(process, 'platform', 'win32');",
      errors: [replacement],
      name: "report jest.replaceProperty with a replacement",
    },
    {
      code: "import { vi } from 'vitest'; const { stubGlobal } = vi; stubGlobal('fetch', fakeFetch);",
      errors: [replacement],
      name: "report stubGlobal destructured from an import of vi",
    },
    {
      code: "vi.fn(() => 42);",
      errors: [replacement],
      name: "report vi.fn with an implementation",
    },
    {
      code: "jest.fn(async () => ({ id: 1 }));",
      errors: [replacement],
      name: "report jest.fn with an async implementation",
    },
    {
      code: "import * as vitest from 'vitest'; vitest.vi.fn(load);",
      errors: [replacement],
      name: "report an implementation through a namespace import",
    },
    {
      code: "vi.spyOn(store, 'save').mockImplementation(() => undefined);",
      errors: [replacement],
      name: "report mockImplementation on a spy",
    },
    {
      code: "vi.spyOn(store, 'load').mockResolvedValue({ id: 1 });",
      errors: [replacement],
      name: "report mockResolvedValue on a spy",
    },
    { code: "save.mockReturnValue(1);", errors: [replacement], name: "report mockReturnValue" },
    {
      code: "save.mockReturnValueOnce(1);",
      errors: [replacement],
      name: "report mockReturnValueOnce",
    },
    {
      code: "save.mockImplementationOnce(() => 1);",
      errors: [replacement],
      name: "report mockImplementationOnce",
    },
    {
      code: "load.mockRejectedValue(new Error('down'));",
      errors: [replacement],
      name: "report mockRejectedValue",
    },
    {
      code: "load.mockRejectedValueOnce(new Error('down'));",
      errors: [replacement],
      name: "report mockRejectedValueOnce",
    },
    {
      code: "load.mockResolvedValueOnce(1);",
      errors: [replacement],
      name: "report mockResolvedValueOnce",
    },
    { code: "builder.mockReturnThis();", errors: [replacement], name: "report mockReturnThis" },
    {
      code: "const save = vi.fn(); save.withImplementation(() => 1, run);",
      errors: [replacement],
      name: "report withImplementation on a mock",
    },
    {
      code: "const save = vi.fn() as Mock<() => number>; save.withImplementation(() => 1, run);",
      errors: [replacement],
      name: "report withImplementation on a mock with a type assertion",
    },
    {
      code: "(vi.fn() as Mock<() => number>).withImplementation(() => 1, run);",
      errors: [replacement],
      name: "report withImplementation on an asserted mock call",
    },
    {
      code: "vi.spyOn(store, 'save').withImplementation(() => 1, run);",
      errors: [replacement],
      name: "report withImplementation on a spy",
    },
    {
      code: "save['mockReturnValue'](1);",
      errors: [replacement],
      name: "report a computed method name",
    },
  ],
  valid: [
    { code: "const store = new InMemoryUserStore();", name: "accept an in-memory implementation" },
    { code: "const save = vi.fn();", name: "accept vi.fn without an implementation" },
    { code: "const save = jest.fn(undefined);", name: "accept jest.fn with undefined" },
    {
      code: "const save = vi.spyOn(store, 'save'); expect(save).toHaveBeenCalledOnce();",
      name: "accept a spy that the test asserts",
    },
    { code: "vi.useFakeTimers();", name: "accept fake timers" },
    { code: "vi.stubEnv('NODE_ENV', 'test');", name: "accept vi.stubEnv" },
    {
      code: "client.withImplementation(strategy, run);",
      name: "accept a withImplementation method of another object",
    },
    { code: "const when = (spy) => spy; when(save);", name: "accept a local function named when" },
    { code: "const fn = { fn() {} }; fn.fn(() => 1);", name: "accept a local fn method" },
    {
      code: "it.effect('loads', () => load.pipe(Effect.provide(Layer.succeed(Store, testStore))));",
      name: "accept a test implementation through an Effect layer",
    },
    { code: "vi.spyOn(store, 'save');", name: "accept vi.spyOn without a mock implementation" },
    { code: "const vi = { mock() {} }; vi.mock();", name: "accept a local object named vi" },
    {
      code: "function test(jest: { mock(): void }) { jest.mock(); }",
      name: "accept a parameter named jest",
    },
    {
      code: "import { vi as localVi } from './helpers'; localVi.mock('./module');",
      name: "accept a vi import from a local module",
    },
    {
      code: "import * as helpers from './helpers'; helpers.vi.mock('./module');",
      name: "accept a namespace import of a local module",
    },
    {
      code: "import * as vitest from 'vitest'; vitest.vi.spyOn(store, 'save');",
      name: "accept a spy through a namespace import",
    },
    {
      code: "const { spyOn } = vi; spyOn(store, 'save');",
      name: "accept a spy destructured from vi",
    },
    {
      code: "const { doMock } = registry; doMock('./module');",
      name: "accept a method destructured from another object",
    },
    {
      code: "const { doMock } = vi; function run(doMock) { doMock('./module'); }",
      name: "accept a parameter that shadows the destructured method",
    },
    {
      code: "const vi = { mock() {} }; const { mock } = vi; mock();",
      name: "accept a method destructured from a local object named vi",
    },
    {
      code: "let { mock } = vi; mock = registry.mock; mock('./module');",
      name: "accept a variable that the code reassigns",
    },
  ],
})
