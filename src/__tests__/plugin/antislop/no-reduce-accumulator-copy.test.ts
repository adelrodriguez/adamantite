import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "accumulatorCopy" }

tester.run("no-reduce-accumulator-copy", plugin.rules["no-reduce-accumulator-copy"], {
  invalid: [
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { [item.id]: item }), {});",
      errors: [error],
    },
    {
      code: "items.reduceRight((acc, item) => Object.assign({}, acc, item), {});",
      errors: [error],
    },
    {
      code: "items.reduce((acc, item, index, array) => Object.assign({}, acc, item), {});",
      errors: [error],
    },
    { code: "items.reduce(acc => Object.assign({}, acc), {});", errors: [error] },
    {
      code: "items.reduce(function (acc, item) { return Object.assign({}, item, acc); }, {});",
      errors: [error],
    },
    {
      code: "items['reduce'](((acc, item) => Object['assign']({}, acc, item)), {});",
      errors: [error],
    },
    {
      code: "items.reduce((acc = {}, item) => Object.assign({}, acc, item), {});",
      errors: [error],
    },
    {
      code: "items.reduce((acc, item) => { const alias = acc; return Object.assign({}, alias, item); }, {});",
      errors: [error],
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc as State, item), {});",
      errors: [error],
    },
    {
      code: "items.reduce((acc, item) => { const next = Object.assign({}, acc); next[item.id] = item; return next; }, {});",
      errors: [error],
    },
    { code: "items.reduce((acc, item) => acc.concat([item]), []);", errors: [error] },
    {
      code: "items.reduceRight((acc, item, index) => acc['concat']([item]), [] as Item[]);",
      errors: [error],
    },
    {
      code: "items.reduce((acc, item) => { const next = acc.slice(); next.push(item); return next; }, []);",
      errors: [error],
    },
    {
      code: "items.reduce((acc, item) => { const alias = acc; return alias.concat(item); }, []);",
      errors: [error],
    },
    {
      code: "const initial = []; items.reduce((acc, item) => acc.concat(item), initial);",
      errors: [error],
    },
    {
      code: "items.reduce((acc, item) => { const next = Array.from(acc); next.push(item); return next; }, []);",
      errors: [error],
    },
    {
      code: "items.reduce((acc, item) => acc.toSpliced(acc.length, 0, item), []);",
      errors: [error],
    },
    { code: "items.reduce((acc, item) => acc.toSorted(), []);", errors: [error] },
    { code: "items.reduce((acc, item) => acc.toReversed(), []);", errors: [error] },
    { code: "items.reduce((acc, item) => acc.with(0, item), []);", errors: [error] },
    {
      code: "items.reduce((acc, item) => acc.toSorted().concat(item), [0, 0]);",
      errors: [error],
      name: "length-preserving copy that the step then grows",
    },
    {
      code: "items.reduce((acc, item) => { const next = acc.with(0, item); next.push(item); return next; }, [0, 0]);",
      errors: [error],
      name: "length-preserving copy that is not the return value",
    },
    {
      code: "items.reduce((acc, item) => acc.slice(1).concat(item), []);",
      errors: [error],
      name: "slice without a fixed window",
    },
    {
      code: "items.reduce((acc, item) => acc.slice(-size).concat(item), []);",
      errors: [error],
      name: "slice with a window that is not a literal",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { [item.id]: item }), { sum: 0 });",
      errors: [error],
      name: "merged source with a computed key",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, item), { sum: 0 });",
      errors: [error],
      name: "merged source with unknown keys",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { ...item }), { sum: 0 });",
      errors: [error],
      name: "merged source with a spread",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { sum: acc.sum + item.n }), {});",
      errors: [error],
      name: "fixed keys on an empty initial value",
    },
    {
      code: "items.reduce((acc, item) => { const next = Object.assign({}, acc, { sum: 1 }); next[item.id] = item; return next; }, { sum: 0 });",
      errors: [error],
      name: "fixed-key copy that is not the return value",
    },
    {
      code: "items.reduce((acc, item) => { acc.push(item); return acc.toReversed(); }, [0]);",
      errors: [error],
      name: "tuple that the step grows before a length-preserving copy",
    },
    {
      code: "items.reduce((acc, item) => { Object.assign(acc, item); return Object.assign({}, acc, { sum: 0 }); }, { sum: 0 });",
      errors: [error],
      name: "object that the step grows before a fixed-key copy",
    },
    {
      code: "items.reduce((acc, item) => { const alias = acc; alias.push(item); return acc.with(0, item); }, [0, 0]);",
      errors: [error],
      name: "tuple that the step grows through an alias before a length-preserving copy",
    },
    {
      code: "items.reduce((acc, item) => { grow(acc); return acc.toSorted(); }, [0, 0]);",
      errors: [error],
      name: "tuple that the step passes to a call before a length-preserving copy",
    },
  ],
  valid: [
    "items.reduce((acc, item) => { acc.push(item); return acc; }, []);",
    "items.reduce((acc, item) => Object.assign(acc, item), {});",
    "items.reduce((acc, item) => Object.assign(acc, acc, item), {});",
    "items.reduce((acc, item) => { acc[item.id] = { ...item }; return acc; }, {});",
    "items.reduce((acc, item) => { acc.push(Object.assign({}, item)); return acc; }, []);",
    "items.reduce((acc, item) => { acc.push(item.slice()); return acc; }, []);",
    "items.reduce((acc, item) => acc.concat(item), '');",
    "items.reduce((acc, item) => acc.concat(item), customCollection);",
    "function copy(acc) { return Object.assign({}, acc); }",
    "items.map((acc, item) => Object.assign({}, acc));",
    "items.reduce((acc, item) => { function copy(acc) { return Object.assign({}, acc); } return acc; }, {});",
    "items.reduce((acc, item) => { const snapshot = () => Object.assign({}, acc); return acc; }, {});",
    "items.reduce((acc, item) => { { const acc = {}; Object.assign({}, acc); } return acc; }, {});",
    "const Object = custom; items.reduce((acc, item) => Object.assign({}, acc), {});",
    "function run(Object) { return items.reduce((acc, item) => Object.assign({}, acc), {}); }",
    "const Array = custom; items.reduce((acc, item) => Array.from(acc), []);",
    "items.reduce((acc, item) => { let alias = acc; alias = item; return Object.assign({}, alias); }, {});",
    "items.reduce((acc, item) => [...acc, item], []);", // Owned by the native rule.
    "items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});",
    {
      code: "items.reduce((acc, item) => acc.slice(-2).concat(item.n), [] as number[]);",
      name: "sliding window with a fixed size",
    },
    {
      code: "items.reduce((acc, item) => acc.slice(0, 3), [] as number[]);",
      name: "slice with fixed bounds",
    },
    {
      code: "items.reduce((acc, item) => acc.with(0, Math.min(acc[0], item.n)), [Infinity, -Infinity]);",
      name: "with on a tuple initial value",
    },
    {
      code: "items.reduce((acc, item) => { return acc.toSorted(); }, [3, 1, 2]);",
      name: "toSorted on a tuple initial value",
    },
    {
      code: "const initial = [0, 0]; items.reduce((acc, item) => acc.toReversed(), initial);",
      name: "toReversed on a tuple bound to a constant",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { sum: acc.sum + item.n }), { sum: 0 });",
      name: "fixed keys on a non-empty initial value",
    },
    {
      code: "items.reduce((acc = [0, 0], item) => acc.with(0, item), [0, 0]);",
      name: "with on a tuple accumulator with a default value",
    },
    {
      code: "items.reduce((acc, item) => { const n = item.n * 2; return acc.with(0, acc[0] + n); }, [0, 0]);",
      name: "with on a tuple in a step with other statements",
    },
  ],
})
