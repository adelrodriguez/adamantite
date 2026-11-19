import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

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
      name: "report an Object.assign copy with a computed key",
    },
    {
      code: "items.reduceRight((acc, item) => Object.assign({}, acc, item), {});",
      errors: [error],
      name: "report an Object.assign copy in reduceRight",
    },
    {
      code: "items.reduce((acc, item, index, array) => Object.assign({}, acc, item), {});",
      errors: [error],
      name: "report an Object.assign copy in a reducer with all four parameters",
    },
    {
      code: "items.reduce(acc => Object.assign({}, acc), {});",
      errors: [error],
      name: "report an Object.assign copy in a reducer with one parameter",
    },
    {
      code: "items.reduce(function (acc, item) { return Object.assign({}, item, acc); }, {});",
      errors: [error],
      name: "report an Object.assign copy with the accumulator last in a function expression",
    },
    {
      code: "items['reduce'](((acc, item) => Object['assign']({}, acc, item)), {});",
      errors: [error],
      name: "report string keys",
    },
    {
      code: "items[`reduce`]((acc, item) => Object[`assign`]({}, acc, item), {});",
      errors: [error],
      name: "report template literal keys",
    },
    {
      code: "rows[`reduceRight`]((acc, row) => acc[`concat`](row), []);",
      errors: [error],
      name: "report concat through a template literal key in reduceRight",
    },
    {
      code: "items.reduce((acc = {}, item) => Object.assign({}, acc, item), {});",
      errors: [error],
      name: "report an Object.assign copy of an accumulator with a default value",
    },
    {
      code: "items.reduce((acc, item) => { const alias = acc; return Object.assign({}, alias, item); }, {});",
      errors: [error],
      name: "report an Object.assign copy of a constant alias of the accumulator",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc as State, item), {});",
      errors: [error],
      name: "report an Object.assign copy of an asserted accumulator",
    },
    {
      code: "items.reduce((acc, item) => { const next = Object.assign({}, acc); next[item.id] = item; return next; }, {});",
      errors: [error],
      name: "report an Object.assign copy that the step then fills",
    },
    {
      code: "items.reduce((acc, item) => acc.concat([item]), []);",
      errors: [error],
      name: "report concat",
    },
    {
      code: "items.reduceRight((acc, item, index) => acc['concat']([item]), [] as Item[]);",
      errors: [error],
      name: "report concat through a string key on an asserted empty array",
    },
    {
      code: "items.reduce((acc, item) => { const next = acc.slice(); next.push(item); return next; }, []);",
      errors: [error],
      name: "report a slice copy that the step then grows",
    },
    {
      code: "items.reduce((acc, item) => { const alias = acc; return alias.concat(item); }, []);",
      errors: [error],
      name: "report concat on a constant alias of the accumulator",
    },
    {
      code: "const initial = []; items.reduce((acc, item) => acc.concat(item), initial);",
      errors: [error],
      name: "report concat on an empty array bound to a constant",
    },
    {
      code: "items.reduce((acc, item) => { const next = Array.from(acc); next.push(item); return next; }, []);",
      errors: [error],
      name: "report an Array.from copy that the step then grows",
    },
    {
      code: "items.reduce((acc, item) => acc.toSpliced(acc.length, 0, item), []);",
      errors: [error],
      name: "report toSpliced",
    },
    {
      code: "items.reduce((acc, item) => acc.toSorted(), []);",
      errors: [error],
      name: "report toSorted on an empty initial value",
    },
    {
      code: "items.reduce((acc, item) => acc.toReversed(), []);",
      errors: [error],
      name: "report toReversed on an empty initial value",
    },
    {
      code: "items.reduce((acc, item) => acc.with(0, item), []);",
      errors: [error],
      name: "report with on an empty initial value",
    },
    {
      code: "items.reduce((acc, item) => acc.toSorted().concat(item), [0, 0]);",
      errors: [error],
      name: "report a length-preserving copy that the step then grows",
    },
    {
      code: "items.reduce((acc, item) => { const next = acc.with(0, item); next.push(item); return next; }, [0, 0]);",
      errors: [error],
      name: "report a length-preserving copy that is not the return value",
    },
    {
      code: "items.reduce((acc, item) => acc.slice(1).concat(item), []);",
      errors: [error],
      name: "report a slice without a fixed window",
    },
    {
      code: "items.reduce((acc, item) => acc.slice(-size).concat(item), []);",
      errors: [error],
      name: "report a slice with a window that is not a literal",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { [item.id]: item }), { sum: 0 });",
      errors: [error],
      name: "report a merged source with a computed key",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, item), { sum: 0 });",
      errors: [error],
      name: "report a merged source with unknown keys",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { ...item }), { sum: 0 });",
      errors: [error],
      name: "report a merged source with a spread",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { sum: acc.sum + item.n }), {});",
      errors: [error],
      name: "report fixed keys on an empty initial value",
    },
    {
      code: "items.reduce((acc, item) => { const next = Object.assign({}, acc, { sum: 1 }); next[item.id] = item; return next; }, { sum: 0 });",
      errors: [error],
      name: "report a fixed-key copy that is not the return value",
    },
    {
      code: "items.reduce((acc, item) => { acc.push(item); return acc.toReversed(); }, [0]);",
      errors: [error],
      name: "report a tuple that the step grows before a length-preserving copy",
    },
    {
      code: "items.reduce((acc, item) => { Object.assign(acc, item); return Object.assign({}, acc, { sum: 0 }); }, { sum: 0 });",
      errors: [error],
      name: "report an object that the step grows before a fixed-key copy",
    },
    {
      code: "items.reduce((acc, item) => { const alias = acc; alias.push(item); return acc.with(0, item); }, [0, 0]);",
      errors: [error],
      name: "report a tuple that the step grows through an alias before a length-preserving copy",
    },
    {
      code: "items.reduce((acc, item) => { grow(acc); return acc.toSorted(); }, [0, 0]);",
      errors: [error],
      name: "report a tuple that the step passes to a call before a length-preserving copy",
    },
    {
      code: "function step(acc, item) { return acc.concat(item); } items.reduce(step, []);",
      errors: [error],
      name: "report a named function as the reducer",
    },
    {
      code: "const step = (acc, item) => acc.concat(item); items.reduce(step, []);",
      errors: [error],
      name: "report a constant arrow function as the reducer",
    },
    {
      code: "const step = function (acc, item) { return Object.assign({}, acc, item); }; items.reduceRight(step, {});",
      errors: [error],
      name: "report a constant function expression as the reducer",
    },
    {
      code: "items.reduce((acc, item) => ([] as number[]).concat(acc, item), []);",
      errors: [error],
      name: "report the accumulator passed to concat on a new array",
    },
    {
      code: "items.reduce((acc, item) => [item].concat(acc), []);",
      errors: [error],
      name: "report the accumulator passed to concat on an array literal",
    },
    {
      code: "items.reduce((acc, item) => globalThis.Object.assign({}, acc, item), {});",
      errors: [error],
      name: "report Object read from globalThis",
    },
    {
      code: "items.reduce((acc, item) => { const next = globalThis.Array.from(acc); next.push(item); return next; }, []);",
      errors: [error],
      name: "report Array read from globalThis",
    },
    {
      code: "items.reduce((acc, item) => { item.tags.forEach((tag) => { acc = acc.concat(tag); }); return acc; }, []);",
      errors: [error],
      name: "report a copy in a callback inside the reducer",
    },
    {
      code: "function step(acc, item) { item.tags.forEach((tag) => { acc = acc.concat(tag); }); return acc; } items.reduce(step, []);",
      errors: [error],
      name: "report a copy in a callback inside a named reducer",
    },
    {
      code: "items.reduce((acc, item) => [...item.tags].concat(acc), [] as string[]);",
      errors: [error],
      name: "report the accumulator passed to concat on a spread array",
    },
  ],
  valid: [
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { 0: acc[0] + item.n }), { 0: 0 });",
      name: "accept a fixed numeric key on a non-empty initial value",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { [0]: acc[0] + item.n }), { 0: 0 });",
      name: "accept a fixed computed numeric key on a non-empty initial value",
    },
    {
      code: 'items.reduce((acc, item) => Object.assign({}, acc, { ["sum"]: acc.sum + item.n }), { sum: 0 });',
      name: "accept a fixed computed string key on a non-empty initial value",
    },
    {
      code: "items.reduce((acc, item) => { acc.push(item); return acc; }, []);",
      name: "accept a push onto the accumulator",
    },
    {
      code: "items.reduce((acc, item) => Object.assign(acc, item), {});",
      name: "accept Object.assign into the accumulator",
    },
    {
      code: "items.reduce((acc, item) => Object.assign(acc, acc, item), {});",
      name: "accept Object.assign into the accumulator from itself",
    },
    {
      code: "items.reduce((acc, item) => { acc[item.id] = { ...item }; return acc; }, {});",
      name: "accept a copy of the item into the accumulator",
    },
    {
      code: "items.reduce((acc, item) => { acc.push(Object.assign({}, item)); return acc; }, []);",
      name: "accept an Object.assign copy of the item pushed onto the accumulator",
    },
    {
      code: "items.reduce((acc, item) => { acc.push(item.slice()); return acc; }, []);",
      name: "accept a slice of the item pushed onto the accumulator",
    },
    {
      code: "items.reduce((acc, item) => acc.concat(item), '');",
      name: "accept concat on a string initial value",
    },
    {
      code: "items.reduce((acc, item) => acc.concat(item), customCollection);",
      name: "accept concat on an initial value that is not a known array",
    },
    {
      code: `items[\`\${method}\`]((acc, item) => Object.assign({}, acc, item), {});`,
      name: "accept a method name from a template literal with an expression",
    },
    {
      code: "function copy(acc) { return Object.assign({}, acc); }",
      name: "accept a copy outside a reducer",
    },
    {
      code: "items.map((acc, item) => Object.assign({}, acc));",
      name: "accept a copy inside a map callback",
    },
    {
      code: "items.reduce((acc, item) => { function copy(acc) { return Object.assign({}, acc); } return acc; }, {});",
      name: "accept a copy inside a nested function that shadows the accumulator",
    },
    {
      code: "items.reduce((acc, item) => { const snapshot = () => Object.assign({}, acc); return acc; }, {});",
      name: "accept a copy inside a stored arrow in the reducer",
    },
    {
      code: "items.reduce((acc, item) => { { const acc = {}; Object.assign({}, acc); } return acc; }, {});",
      name: "accept a copy of a block binding that shadows the accumulator",
    },
    {
      code: "const Object = custom; items.reduce((acc, item) => Object.assign({}, acc), {});",
      name: "accept a local Object binding",
    },
    {
      code: "function run(Object) { return items.reduce((acc, item) => Object.assign({}, acc), {}); }",
      name: "accept a parameter named Object",
    },
    {
      code: "const Array = custom; items.reduce((acc, item) => Array.from(acc), []);",
      name: "accept a local Array binding",
    },
    {
      code: "items.reduce((acc, item) => { let alias = acc; alias = item; return Object.assign({}, alias); }, {});",
      name: "accept a copy of an alias that the code reassigns",
    },
    {
      code: "items.reduce((acc, item) => [...acc, item], []);",
      name: "accept an array spread of the accumulator",
    }, // Owned by the native rule.
    {
      code: "items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});",
      name: "accept an object spread of the accumulator",
    },
    {
      code: "items.reduce((acc, item) => acc.slice(-2).concat(item.n), [] as number[]);",
      name: "accept a sliding window with a fixed size",
    },
    {
      code: "items.reduce((acc, item) => acc.slice(0, 3), [] as number[]);",
      name: "accept a slice with fixed bounds",
    },
    {
      code: "items.reduce((acc, item) => acc.with(0, Math.min(acc[0], item.n)), [Infinity, -Infinity]);",
      name: "accept with on a tuple initial value",
    },
    {
      code: "items.reduce((acc, item) => { return acc.toSorted(); }, [3, 1, 2]);",
      name: "accept toSorted on a tuple initial value",
    },
    {
      code: "const initial = [0, 0]; items.reduce((acc, item) => acc.toReversed(), initial);",
      name: "accept toReversed on a tuple bound to a constant",
    },
    {
      code: "items.reduce((acc, item) => Object.assign({}, acc, { sum: acc.sum + item.n }), { sum: 0 });",
      name: "accept fixed keys on a non-empty initial value",
    },
    {
      code: "items.reduce((acc = [0, 0], item) => acc.with(0, item), [0, 0]);",
      name: "accept with on a tuple accumulator with a default value",
    },
    {
      code: "items.reduce((acc, item) => { const n = item.n * 2; return acc.with(0, acc[0] + n); }, [0, 0]);",
      name: "accept with on a tuple in a step with other statements",
    },
    {
      code: "function step(acc, item) { return acc.slice(-2).concat(item); } items.reduce(step, [] as number[]);",
      name: "accept a named reducer with a sliding window",
    },
    {
      code: "function step(acc, item) { return Object.assign({}, acc, item); } items.map(step);",
      name: "accept a named function that no reduce call uses",
    },
    {
      code: "let step = (acc, item) => acc.concat(item); step = other; items.reduce(step, []);",
      name: "accept a reducer variable that the code reassigns",
    },
    {
      code: "import { step } from './step'; items.reduce(step, []);",
      name: "accept an imported reducer",
    },
    {
      code: "items.reduce((acc, item) => prefix.concat(acc), []);",
      name: "accept the accumulator passed to concat on an unknown receiver",
    },
    {
      code: "items.reduce((acc, item) => [item].concat(other), []);",
      name: "accept concat on a new array without the accumulator",
    },
    {
      code: "function run(globalThis) { return items.reduce((acc, item) => globalThis.Object.assign({}, acc), {}); }",
      name: "accept a parameter that shadows globalThis",
    },
    {
      code: "function step(acc, item) { return acc.concat(item); } items.reduce(step, customCollection);",
      name: "accept a named reducer on an initial value that is not a known array",
    },
    {
      code: "items.reduce((acc, item) => { const read = () => acc.concat(item); return acc; }, []);",
      name: "accept a copy in a stored callback inside the reducer",
    },
  ],
})
