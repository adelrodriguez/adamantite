import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/testing/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const retry = { messageId: "retry" }
const timeout = { messageId: "timeout" }
const flakyTest = { messageId: "flakyTest" }

tester.run("no-flake-masking", plugin.rules["no-flake-masking"], {
  invalid: [
    {
      code: 'test("loads", { retry: 2 }, async () => {});',
      errors: [retry],
      name: "report a retry option of a test",
    },
    {
      code: 'test("loads", async () => {}, 60_000);',
      errors: [timeout],
      filename: "src/__tests__/bench.test.ts",
      name: "report a timeout in a test file whose name only contains bench",
    },
    {
      code: 'it("loads", { retry: 2 }, async () => {});',
      errors: [retry],
      name: "report a retry option of it",
    },
    {
      code: 'describe("loader", { retry: 3 }, () => {});',
      errors: [retry],
      name: "report a retry option of describe",
    },
    {
      code: 'test.concurrent("loads", { retry: 1 }, async () => {});',
      errors: [retry],
      name: "report a retry option of test.concurrent",
    },
    {
      code: 'test.each([1, 2])("loads %i", { retry: 1 }, async () => {});',
      errors: [retry],
      name: "report a retry option of test.each",
    },
    {
      code: 'test("loads", async () => {}, { retry: 2 });',
      errors: [retry],
      name: "report a retry option after the test function",
    },
    {
      code: 'test("loads", { "retry": 2 }, async () => {});',
      errors: [retry],
      name: "report a retry option under a string key",
    },
    {
      code: "vi.setConfig({ retry: 2 });",
      errors: [retry],
      name: "report a retry option of vi.setConfig",
    },
    {
      code: "jest.retryTimes(3);",
      errors: [retry],
      name: "report jest.retryTimes, which retries every later test",
    },
    {
      code: "export default defineConfig({ test: { retry: 2 } });",
      errors: [retry],
      filename: "vitest.config.ts",
      name: "report a retry option in a Vitest config",
    },
    {
      code: "export default defineConfig({ test: { retry: process.env.CI ? 2 : 0 } });",
      errors: [retry],
      filename: "vitest.config.ts",
      name: "report a conditional retry option in a Vitest config",
    },
    {
      code: "export default defineConfig({ test: { projects: [{ test: { name: 'node', retry: 1 } }] } });",
      errors: [retry],
      filename: "vitest.config.ts",
      name: "report a retry option in a Vitest project config",
    },
    {
      code: 'test("loads", async () => {}, 60_000);',
      errors: [timeout],
      name: "report a timeout argument",
    },
    {
      code: 'test.each`a | b`("loads $a", () => {}, 60_000);',
      errors: [timeout],
      name: "report a timeout argument of a tagged test table",
    },
    {
      code: 'it.scoped("loads", () => Effect.void, 60_000);',
      errors: [timeout],
      name: "report a timeout argument of a scoped test of @effect/vitest 3",
    },
    {
      code: 'const options = { retry: 2, timeout: 60_000 }; function body() {} test("a", options, body); test("b", options, body);',
      errors: [retry, timeout],
      name: "report options in a binding that two tests share once",
    },
    {
      code: 'const options = { timeout: 60_000 }; test("loads", async () => {}, options);',
      errors: [timeout],
      name: "report options in a binding after the test function",
    },
    {
      code: "const options = { retry: 2 }; export default defineConfig({ test: options });",
      errors: [retry],
      filename: "vitest.config.ts",
      name: "report Vitest config options in a binding",
    },
    {
      code: 'const options = { timeout: 60_000, testTimeout: 60_000 }; test("loads", options, body); vi.setConfig(options);',
      errors: [timeout, timeout],
      name: "report one binding that a test and vi.setConfig read for different keys",
    },
    {
      code: "const config = { testTimeout: 45_000 }; vi.setConfig(config);",
      errors: [timeout],
      name: "report vi.setConfig options in a binding",
    },
    {
      code: 'const LONG = 60_000 as const; test("loads", load, LONG);',
      errors: [timeout],
      name: "report a timeout constant with a type assertion",
    },
    {
      code: 'test("loads", load, 60_000 satisfies number);',
      errors: [timeout],
      name: "report a timeout with satisfies",
    },
    {
      code: 'const LONG = 60_000; test("loads", load, LONG);',
      errors: [timeout],
      name: "report a timeout constant after a named test function",
    },
    {
      code: 'it("loads", async () => {}, 30000);',
      errors: [timeout],
      name: "report a timeout argument of it",
    },
    {
      code: 'test("loads", async () => {}, LONG_TIMEOUT);',
      errors: [timeout],
      name: "report a timeout constant",
    },
    {
      code: 'test("loads", async () => {}, 2 * 60_000);',
      errors: [timeout],
      name: "report a computed timeout",
    },
    {
      code: 'test("loads", load, 60_000);',
      errors: [timeout],
      name: "report a timeout after a named test function",
    },
    {
      code: 'test("loads", { timeout: 60_000 }, async () => {});',
      errors: [timeout],
      name: "report a timeout option before the test function",
    },
    {
      code: 'test("loads", async () => {}, { timeout: 60_000 });',
      errors: [timeout],
      name: "report a timeout option after the test function",
    },
    {
      code: 'test.each([1])("loads %i", async () => {}, 20_000);',
      errors: [timeout],
      name: "report a timeout argument of test.each",
    },
    {
      code: 'test.skipIf(ci)("loads", async () => {}, 20_000);',
      errors: [timeout],
      name: "report a timeout argument of test.skipIf",
    },
    {
      code: 'describe("loader", { timeout: 60_000 }, () => {});',
      errors: [timeout],
      name: "report a timeout option of describe",
    },
    {
      code: "vi.setConfig({ testTimeout: 45_000 });",
      errors: [timeout],
      name: "report a testTimeout option of vi.setConfig",
    },
    {
      code: "vi.setConfig({ hookTimeout: 45_000 });",
      errors: [timeout],
      name: "report a hookTimeout option of vi.setConfig",
    },
    {
      code: "jest.setTimeout(45_000);",
      errors: [timeout],
      name: "report jest.setTimeout, which raises every timeout",
    },
    {
      code: 'it.effect("loads", () => Effect.void, 60_000);',
      errors: [timeout],
      name: "report a timeout of an @effect/vitest test",
    },
    {
      code: 'layer(Live)("loader", (it) => { it.live("loads", () => Effect.void, 60_000) });',
      errors: [timeout],
      name: "report a timeout of an @effect/vitest test in a layer suite",
    },
    {
      code: 'it.effect("loads", () => it.flakyTest(load, "5 seconds"));',
      errors: [flakyTest],
      name: "report it.flakyTest",
    },
    {
      code: 'import { flakyTest } from "@effect/vitest"; it.effect("loads", () => flakyTest(load));',
      errors: [flakyTest],
      name: "report a flakyTest import",
    },
    {
      code: 'import { flakyTest as retried } from "@effect/vitest"; it.effect("loads", () => retried(load));',
      errors: [flakyTest],
      name: "report a renamed import of flakyTest",
    },
  ],
  valid: [
    { code: 'test("loads", async () => {});', name: "accept a test without options" },
    { code: 'test("loads", { tags: ["slow"] }, async () => {});', name: "accept a test with tags" },
    {
      code: 'test("loads", { concurrent: true }, function load() {});',
      name: "accept a concurrent test with a named function",
    },
    {
      code: 'test.each([1, 2])("loads %i", async () => {});',
      name: "accept test.each without options",
    },
    {
      code: 'it.effect("loads", () => Effect.void);',
      name: "accept an Effect test without a timeout",
    },
    {
      code: "beforeAll(async () => { await server.listen(); }, 60_000);",
      name: "accept a beforeAll timeout",
    },
    { code: "afterAll(() => server.close(), 30_000);", name: "accept an afterAll timeout" },
    {
      code: "await expect.poll(() => count(), { timeout: 5_000 }).toBe(1);",
      name: "accept an expect.poll timeout",
    },
    {
      code: "await vi.waitFor(() => expect(count()).toBe(1), { timeout: 5_000 });",
      name: "accept a vi.waitFor timeout",
    },
    {
      code: "const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });",
      name: "accept a retry option of a query client",
    },
    { code: "queue.retry({ delaySeconds: 30 });", name: "accept a retry method of a queue" },
    {
      code: "const policy = { retry: { maxAttempts: 1 } };",
      name: "accept a retry key in a plain object",
    },
    { code: "const loaded = load.pipe(Effect.retry({ times: 2 }));", name: "accept Effect.retry" },
    {
      code: "export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 60_000 } });",
      name: "accept timeouts in a Vitest config",
    },
    {
      code: "vi.setConfig({ fakeTimers: { now: 0 } });",
      name: "accept vi.setConfig without retry or timeout",
    },
    {
      code: 'const options = { concurrent: true }; function body() {} test("loads", options, body);',
      name: "accept options and a test function in bindings",
    },
    {
      code: 'const options = { concurrent: true }; const body = () => {}; test("loads", options, body);',
      name: "accept options and an arrow test function in bindings",
    },
    {
      code: "const fixture = { test: { retry: 2 } };",
      filename: "src/config.test.ts",
      name: "accept test data that looks like a Vitest config",
    },
    {
      code: 'const test = base.scoped({ server: "http://localhost" });',
      name: "accept Vitest fixture values set with scoped",
    },
    {
      code: 'test.for(operations)("$name", { timeout: 600_000 }, async () => {});',
      filename: "src/__tests__/index.bench.ts",
      name: "accept a timeout in a benchmark file",
    },
    {
      code: "function flakyTest(effect) { return effect } flakyTest(load);",
      name: "accept a local function named flakyTest",
    },
    {
      code: 'const test = base.extend({ server: async ({}, use) => use(server) }); test("loads", async ({ server }) => {});',
      name: "accept a fixture extension",
    },
  ],
})
