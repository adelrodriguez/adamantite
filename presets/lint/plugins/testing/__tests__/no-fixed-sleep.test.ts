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
      name: "report a setTimeout promise",
    },
    {
      code: "test('x', async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });",
      errors: [sleep],
      name: "report a zero setTimeout promise",
    },
    {
      code: "test('x', async () => { await new Promise<void>((done) => globalThis.setTimeout(() => done(), 31_000)); });",
      errors: [sleep],
      name: "report globalThis.setTimeout",
    },
    {
      code: "it('x', async () => { await new Promise((resolve) => window.setTimeout(resolve, 600)); });",
      errors: [sleep],
      name: "report window.setTimeout",
    },
    {
      code: 'import { setTimeout as wait } from "node:timers/promises"; test("x", async () => { await wait(500); });',
      errors: [sleep],
      name: "report a renamed setTimeout import from node:timers/promises",
    },
    {
      code: 'import { setTimeout } from "timers/promises"; afterEach(async () => { await setTimeout(20); });',
      errors: [sleep],
      name: "report setTimeout from timers/promises in a hook",
    },
    {
      code: 'import timers from "node:timers/promises"; test("x", async () => { await timers.setTimeout(20); });',
      errors: [sleep],
      name: "report a default import of the timer module",
    },
    {
      code: 'import * as timers from "node:timers/promises"; test("x", async () => { await timers.setTimeout(20); });',
      errors: [sleep],
      name: "report a namespace import of the timer module",
    },
    {
      code: "beforeEach(async () => { await scheduler.wait(10); });",
      errors: [sleep],
      name: "report scheduler.wait in a hook",
    },
    {
      code: "test('x', async () => { await Bun.sleep(100); });",
      errors: [sleep],
      name: "report Bun.sleep",
    },
    {
      code: "test.each([1])('x %s', async () => { await scheduler.wait(1); });",
      errors: [sleep],
      name: "report a sleep in test.each",
    },
    {
      code: "test.concurrent('x', async () => { await scheduler.wait(1); });",
      errors: [sleep],
      name: "report a sleep in test.concurrent",
    },
    {
      code: "it.skipIf(ci)('x', async function () { await scheduler.wait(1); });",
      errors: [sleep],
      name: "report a sleep in a function expression passed to it.skipIf",
    },
    {
      code: "test('x', async () => { await scheduler.wait(1); await scheduler.wait(2); });",
      errors: [sleep, sleep],
      name: "report each sleep in a test",
    },
    {
      code: 'it.live("x", () => Effect.gen(function* () { yield* Effect.sleep("100 millis"); }));',
      errors: [sleep],
      name: "report Effect.sleep in a live Effect test",
    },
    {
      code: 'it.effect("x", () => { return Effect.gen(function* () { yield* Effect.sleep("1 second"); }); });',
      errors: [sleep],
      name: "report Effect.sleep in an Effect test that returns its generator",
    },
    {
      code: 'import { setTimeout as delay } from "node:timers/promises"; test("x", () => delay(1000));',
      errors: [sleep],
      name: "report a sleep that a concise test callback returns",
    },
    {
      code: "test('x', () => { return new Promise((resolve) => setTimeout(resolve, 100)); });",
      errors: [sleep],
      name: "report a sleep that a test callback returns",
    },
    {
      code: 'import { TestClock as Clock } from "effect"; function now(Clock) { return Clock.now(); } test("x", async () => { await scheduler.wait(1); });',
      errors: [sleep],
      name: "report a sleep when a parameter shadows the TestClock import",
    },
    {
      code: 'const TestClock = { adjust() {} }; TestClock.adjust(); test("x", async () => { await scheduler.wait(1); });',
      errors: [sleep],
      name: "report a sleep beside a local object named TestClock",
    },
    {
      code: 'it.live("x", () => Effect.gen(function* () { yield* Effect.sleep("100 millis"); }).pipe(Effect.provide(Layer.empty)));',
      errors: [sleep],
      name: "report Effect.sleep in an Effect test that pipes its generator",
    },
  ],
  valid: [
    {
      code: "test('x', async () => { await operation(); });",
      name: "accept awaiting an operation",
    },
    {
      code: "test('x', async () => { const ready = Promise.withResolvers(); await ready.promise; });",
      name: "accept awaiting a promise that the test resolves",
    },
    {
      code: "test('x', async () => { vi.useFakeTimers(); await new Promise((resolve) => { setTimeout(resolve, 250); }); });",
      name: "accept a setTimeout sleep after vi.useFakeTimers",
    },
    {
      code: "test('x', async () => { jest.useFakeTimers(); await scheduler.wait(10); });",
      name: "accept scheduler.wait after jest.useFakeTimers",
    },
    {
      code: "test('x', async () => { serve(async () => { await scheduler.wait(10); return new Response(); }); });",
      name: "accept a sleep inside a server handler",
    },
    {
      code: "async function backoff(attempt) { await scheduler.wait(2 ** attempt); } test('x', async () => { await backoff(1); });",
      name: "accept a sleep inside a helper function",
    },
    {
      code: "test('x', async () => { await Promise.race([work, new Promise((resolve) => { setTimeout(() => resolve('pending'), 0); })]); });",
      name: "accept a zero timeout inside Promise.race",
    },
    {
      code: "test('x', async () => { await new Promise((resolve) => { setTimeout(resolve, 10); queueMicrotask(resolve); }); });",
      name: "accept a timeout that races a microtask",
    },
    {
      code: "test('x', async () => { await new Promise((resolve) => { emitter.once('done', resolve); }); });",
      name: "accept a promise that waits for an event",
    },
    {
      code: 'import { setImmediate } from "node:timers/promises"; test("x", async () => { await setImmediate(); });',
      name: "accept setImmediate from node:timers/promises",
    },
    {
      code: "test('x', async () => { const timer = setTimeout(cancel, 10); await work(); clearTimeout(timer); });",
      name: "accept a timeout that cancels work",
    },
    {
      code: 'import { TestClock } from "effect"; it.effect("x", () => Effect.gen(function* () { const fiber = yield* Effect.fork(Effect.sleep("1 second")); yield* TestClock.adjust("1 second"); yield* Fiber.join(fiber); }));',
      name: "accept an Effect test that moves time with TestClock",
    },
    {
      code: 'import * as TestClock from "effect/testing/TestClock"; it.effect("x", () => Effect.gen(function* () { yield* Effect.sleep("1 second"); yield* TestClock.adjust("1 second"); }));',
      name: "accept an Effect test file that uses TestClock",
    },
    {
      code: 'const retry = Effect.gen(function* () { yield* Effect.sleep("1 second"); }); it.effect("x", () => retry);',
      name: "accept Effect.sleep in a helper effect",
    },
    {
      code: 'import { TestClock as Clock } from "effect"; it.effect("x", () => Effect.gen(function* () { yield* Effect.sleep("1 second"); yield* Clock.adjust("1 second"); }));',
      name: "accept an aliased import of TestClock",
    },
    {
      code: 'import { setTimeout as delay } from "node:timers/promises"; const later = () => delay(10); test("x", async () => { await work(); });',
      name: "accept a sleep that a helper returns outside a test",
    },
    {
      code: 'it.live("x", () => Effect.void.pipe(Effect.andThen(Effect.gen(function* () { yield* Effect.sleep("1 second"); }))));',
      name: "accept Effect.sleep in an effect that a pipe step builds",
    },
  ],
})
