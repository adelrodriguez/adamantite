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
    { code: 'test("loads", { retry: 2 }, async () => {});', errors: [retry] },
    {
      code: 'test("loads", async () => {}, 60_000);',
      errors: [timeout],
      filename: "src/__tests__/bench.test.ts",
      name: "a test file whose name only contains bench",
    },
    { code: 'it("loads", { retry: 2 }, async () => {});', errors: [retry] },
    { code: 'describe("loader", { retry: 3 }, () => {});', errors: [retry] },
    { code: 'test.concurrent("loads", { retry: 1 }, async () => {});', errors: [retry] },
    { code: 'test.each([1, 2])("loads %i", { retry: 1 }, async () => {});', errors: [retry] },
    { code: 'test("loads", async () => {}, { retry: 2 });', errors: [retry] },
    { code: 'test("loads", { "retry": 2 }, async () => {});', errors: [retry] },
    { code: "vi.setConfig({ retry: 2 });", errors: [retry] },
    { code: "jest.retryTimes(3);", errors: [retry], name: "Jest retries every later test" },
    {
      code: "export default defineConfig({ test: { retry: 2 } });",
      errors: [retry],
      filename: "vitest.config.ts",
    },
    {
      code: "export default defineConfig({ test: { retry: process.env.CI ? 2 : 0 } });",
      errors: [retry],
      filename: "vitest.config.ts",
    },
    {
      code: "export default defineConfig({ test: { projects: [{ test: { name: 'node', retry: 1 } }] } });",
      errors: [retry],
      filename: "vitest.config.ts",
    },
    { code: 'test("loads", async () => {}, 60_000);', errors: [timeout] },
    {
      code: 'test.each`a | b`("loads $a", () => {}, 60_000);',
      errors: [timeout],
      name: "a tagged test table",
    },
    {
      code: 'it.scoped("loads", () => Effect.void, 60_000);',
      errors: [timeout],
      name: "a scoped test of @effect/vitest 3",
    },
    {
      code: 'const options = { retry: 2, timeout: 60_000 }; function body() {} test("a", options, body); test("b", options, body);',
      errors: [retry, timeout],
      name: "options in a binding that two tests share",
    },
    {
      code: 'const options = { timeout: 60_000 }; test("loads", async () => {}, options);',
      errors: [timeout],
      name: "options in a binding after the test function",
    },
    {
      code: "const config = { testTimeout: 45_000 }; vi.setConfig(config);",
      errors: [timeout],
      name: "vi.setConfig options in a binding",
    },
    {
      code: 'const LONG = 60_000; test("loads", load, LONG);',
      errors: [timeout],
      name: "a timeout constant after a named test function",
    },
    { code: 'it("loads", async () => {}, 30000);', errors: [timeout] },
    { code: 'test("loads", async () => {}, LONG_TIMEOUT);', errors: [timeout] },
    { code: 'test("loads", async () => {}, 2 * 60_000);', errors: [timeout] },
    { code: 'test("loads", load, 60_000);', errors: [timeout], name: "a named test function" },
    { code: 'test("loads", { timeout: 60_000 }, async () => {});', errors: [timeout] },
    { code: 'test("loads", async () => {}, { timeout: 60_000 });', errors: [timeout] },
    { code: 'test.each([1])("loads %i", async () => {}, 20_000);', errors: [timeout] },
    { code: 'test.skipIf(ci)("loads", async () => {}, 20_000);', errors: [timeout] },
    { code: 'describe("loader", { timeout: 60_000 }, () => {});', errors: [timeout] },
    { code: "vi.setConfig({ testTimeout: 45_000 });", errors: [timeout] },
    { code: "vi.setConfig({ hookTimeout: 45_000 });", errors: [timeout] },
    { code: "jest.setTimeout(45_000);", errors: [timeout], name: "Jest raises every timeout" },
    {
      code: 'it.effect("loads", () => Effect.void, 60_000);',
      errors: [timeout],
      name: "an @effect/vitest test",
    },
    {
      code: 'layer(Live)("loader", (it) => { it.live("loads", () => Effect.void, 60_000) });',
      errors: [timeout],
      name: "an @effect/vitest test in a layer suite",
    },
    {
      code: 'it.effect("loads", () => it.flakyTest(load, "5 seconds"));',
      errors: [flakyTest],
    },
    {
      code: 'import { flakyTest } from "@effect/vitest"; it.effect("loads", () => flakyTest(load));',
      errors: [flakyTest],
    },
    {
      code: 'import { flakyTest as retried } from "@effect/vitest"; it.effect("loads", () => retried(load));',
      errors: [flakyTest],
      name: "a renamed import of flakyTest",
    },
  ],
  valid: [
    'test("loads", async () => {});',
    'test("loads", { tags: ["slow"] }, async () => {});',
    'test("loads", { concurrent: true }, function load() {});',
    'test.each([1, 2])("loads %i", async () => {});',
    'it.effect("loads", () => Effect.void);',
    "beforeAll(async () => { await server.listen(); }, 60_000);",
    "afterAll(() => server.close(), 30_000);",
    "await expect.poll(() => count(), { timeout: 5_000 }).toBe(1);",
    "await vi.waitFor(() => expect(count()).toBe(1), { timeout: 5_000 });",
    "const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });",
    "queue.retry({ delaySeconds: 30 });",
    "const policy = { retry: { maxAttempts: 1 } };",
    "const loaded = load.pipe(Effect.retry({ times: 2 }));",
    "export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 60_000 } });",
    "vi.setConfig({ fakeTimers: { now: 0 } });",
    {
      code: 'const options = { concurrent: true }; function body() {} test("loads", options, body);',
      name: "options and a test function in bindings",
    },
    {
      code: 'const options = { concurrent: true }; const body = () => {}; test("loads", options, body);',
      name: "options and an arrow test function in bindings",
    },
    {
      code: "const fixture = { test: { retry: 2 } };",
      filename: "src/config.test.ts",
      name: "test data that looks like a Vitest config",
    },
    {
      code: 'const test = base.scoped({ server: "http://localhost" });',
      name: "Vitest fixture values set with scoped",
    },
    {
      code: 'test.for(operations)("$name", { timeout: 600_000 }, async () => {});',
      filename: "src/__tests__/index.bench.ts",
      name: "a timeout in a benchmark file",
    },
    {
      code: "function flakyTest(effect) { return effect } flakyTest(load);",
      name: "a local function named flakyTest",
    },
    {
      code: 'const test = base.extend({ server: async ({}, use) => use(server) }); test("loads", async ({ server }) => {});',
      name: "a fixture extension",
    },
  ],
})
