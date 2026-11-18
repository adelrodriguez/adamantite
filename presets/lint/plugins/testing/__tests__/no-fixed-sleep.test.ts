import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/testing/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const sleep = { messageId: "sleep" }

tester.run("no-fixed-sleep", plugin.rules["no-fixed-sleep"], {
  invalid: [
    {
      code: "test('x', async () => { await new Promise((resolve) => { setTimeout(resolve, 250); }); });",
      errors: [sleep],
    },
    {
      code: "test('x', async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });",
      errors: [sleep],
    },
    {
      code: "test('x', async () => { await new Promise<void>((done) => globalThis.setTimeout(() => done(), 31_000)); });",
      errors: [sleep],
    },
    {
      code: "it('x', async () => { await new Promise((resolve) => window.setTimeout(resolve, 600)); });",
      errors: [sleep],
    },
    {
      code: 'import { setTimeout as wait } from "node:timers/promises"; test("x", async () => { await wait(500); });',
      errors: [sleep],
    },
    {
      code: 'import { setTimeout } from "timers/promises"; afterEach(async () => { await setTimeout(20); });',
      errors: [sleep],
    },
    {
      code: 'import timers from "node:timers/promises"; test("x", async () => { await timers.setTimeout(20); });',
      errors: [sleep],
      name: "a default import of the timer module",
    },
    {
      code: 'import * as timers from "node:timers/promises"; test("x", async () => { await timers.setTimeout(20); });',
      errors: [sleep],
      name: "a namespace import of the timer module",
    },
    { code: "beforeEach(async () => { await scheduler.wait(10); });", errors: [sleep] },
    { code: "test('x', async () => { await Bun.sleep(100); });", errors: [sleep] },
    { code: "test.each([1])('x %s', async () => { await scheduler.wait(1); });", errors: [sleep] },
    { code: "test.concurrent('x', async () => { await scheduler.wait(1); });", errors: [sleep] },
    {
      code: "it.skipIf(ci)('x', async function () { await scheduler.wait(1); });",
      errors: [sleep],
    },
    {
      code: "test('x', async () => { await scheduler.wait(1); await scheduler.wait(2); });",
      errors: [sleep, sleep],
    },
    {
      code: 'it.live("x", () => Effect.gen(function* () { yield* Effect.sleep("100 millis"); }));',
      errors: [sleep],
      name: "Effect.sleep in a live Effect test",
    },
    {
      code: 'it.effect("x", () => { return Effect.gen(function* () { yield* Effect.sleep("1 second"); }); });',
      errors: [sleep],
      name: "Effect.sleep in an Effect test that returns its generator",
    },
    {
      code: 'it.live("x", () => Effect.gen(function* () { yield* Effect.sleep("100 millis"); }).pipe(Effect.provide(Layer.empty)));',
      errors: [sleep],
      name: "Effect.sleep in an Effect test that pipes its generator",
    },
  ],
  valid: [
    "test('x', async () => { await operation(); });",
    "test('x', async () => { const ready = Promise.withResolvers(); await ready.promise; });",
    "test('x', async () => { vi.useFakeTimers(); await new Promise((resolve) => { setTimeout(resolve, 250); }); });",
    "test('x', async () => { jest.useFakeTimers(); await scheduler.wait(10); });",
    "test('x', async () => { serve(async () => { await scheduler.wait(10); return new Response(); }); });",
    "async function backoff(attempt) { await scheduler.wait(2 ** attempt); } test('x', async () => { await backoff(1); });",
    "test('x', async () => { await Promise.race([work, new Promise((resolve) => { setTimeout(() => resolve('pending'), 0); })]); });",
    "test('x', async () => { await new Promise((resolve) => { setTimeout(resolve, 10); queueMicrotask(resolve); }); });",
    "test('x', async () => { await new Promise((resolve) => { emitter.once('done', resolve); }); });",
    'import { setImmediate } from "node:timers/promises"; test("x", async () => { await setImmediate(); });',
    "test('x', async () => { const timer = setTimeout(cancel, 10); await work(); clearTimeout(timer); });",
    {
      code: 'it.effect("x", () => Effect.gen(function* () { const fiber = yield* Effect.fork(Effect.sleep("1 second")); yield* TestClock.adjust("1 second"); yield* Fiber.join(fiber); }));',
      name: "an Effect test that moves time with TestClock",
    },
    {
      code: 'it.effect("x", () => Effect.gen(function* () { yield* Effect.sleep("1 second"); yield* TestClock.adjust("1 second"); }));',
      name: "an Effect test file that uses TestClock",
    },
    {
      code: 'const retry = Effect.gen(function* () { yield* Effect.sleep("1 second"); }); it.effect("x", () => retry);',
      name: "Effect.sleep in a helper effect",
    },
    {
      code: 'it.live("x", () => Effect.void.pipe(Effect.andThen(Effect.gen(function* () { yield* Effect.sleep("1 second"); }))));',
      name: "Effect.sleep in an effect that a pipe step builds",
    },
  ],
})
