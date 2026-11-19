import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "arrayFilterMap" }

tester.run("no-array-filter-map", plugin.rules["no-array-filter-map"], {
  invalid: [
    {
      code: "[].filter(active).map(email);",
      errors: [error],
      name: "report filter then map on an array literal",
    },
    {
      code: "[].map(user => user.active ? user.email : undefined).filter(email => email !== undefined);",
      errors: [error],
      name: "report map then filter on an array literal",
    },
    {
      code: "const users = []; users.map(email).filter(Boolean);",
      errors: [error],
      name: "report map then filter on an array binding",
    },
    {
      code: "const users = []; const alias = users; alias.filter(active).map(email);",
      errors: [error],
      name: "report a constant alias of an array",
    },
    {
      code: "function collect(users: User[]) { return users.filter(active).map(email); }",
      errors: [error],
      name: "report an array type parameter",
    },
    {
      code: "function collect(users: readonly User[]) { return users.map(email).filter(present); }",
      errors: [error],
      name: "report a readonly array type parameter",
    },
    {
      code: "function collect(users: ReadonlyArray<User>) { return users.filter(active).map(email); }",
      errors: [error],
      name: "report a ReadonlyArray parameter",
    },
    {
      code: "function collect(users: Array<User>) { return users.filter(active).map(email); }",
      errors: [error],
      name: "report an Array parameter",
    },
    {
      code: "function collect(users: globalThis.Array<User>) { return users.filter(active).map(email); }",
      errors: [error],
      name: "report a globalThis.Array parameter",
    },
    {
      code: "function collect(users: globalThis.ReadonlyArray<User>) { return users.map(email).filter(present); }",
      errors: [error],
      name: "report a globalThis.ReadonlyArray parameter",
    },
    {
      code: "const users = [] as const; users['filter'](active)['map'](email);",
      errors: [error],
      name: "report string keys on a const-asserted array",
    },
    {
      code: "const users = []; users[`filter`](active)[`map`](email);",
      errors: [error],
      name: "report template literal keys",
    },
    {
      code: "const users = []; users.map(email)[`filter`](Boolean);",
      errors: [error],
      name: "report a template literal filter key after map",
    },
    {
      code: "const users = []; (users.filter(active)!).map(email);",
      errors: [error],
      name: "report a non-null assertion between filter and map",
    },
    {
      code: "const users = []; users?.filter(active)?.map(email);",
      errors: [error],
      name: "report optional calls",
    },
    {
      code: "const users = []; users.slice().filter(active).map(email);",
      errors: [error],
      name: "report filter then map after an array copy",
    },
    {
      code: "const users = []; users.filter(active).map(email).filter(Boolean);",
      errors: [error, error],
      name: "report each pair in a longer chain",
    },
    {
      code: "let zs: number[] = []; zs = load(); zs.filter(f).map(g);",
      errors: [error],
      name: "report a reassigned variable with an array annotation",
    },
    {
      code: "let zs: ReadonlyArray<number>; zs = load(); zs.map(g).filter(Boolean);",
      errors: [error],
      name: "report a reassigned variable with a readonly array annotation",
    },
  ],
  valid: [
    {
      code: "const users = []; users.values().filter(active).map(email).toArray();",
      name: "accept filter then map on an array iterator",
    },
    {
      code: "const users = []; users.values().map(email).filter(Boolean).toArray();",
      name: "accept map then filter on an array iterator",
    },
    {
      code: "Iterator.from(users).filter(active).map(email).toArray();",
      name: "accept filter then map on Iterator.from",
    },
    {
      code: "function collect(users: IteratorObject<User>) { return users.filter(active).map(email).toArray(); }",
      name: "accept filter then map on an IteratorObject parameter",
    },
    {
      code: "const users = []; users.flatMap(user => user.active ? [user.email] : []);",
      name: "accept flatMap",
    },
    {
      code: "const users = []; users.map(email); users.filter(active);",
      name: "accept filter and map in separate statements",
    },
    { code: "const users = []; users.map(email).map(normalize);", name: "accept map then map" },
    {
      code: "const users = []; users.filter(active).filter(verified);",
      name: "accept filter then filter",
    },
    {
      code: "const custom = { filter() { return this; }, map() {} }; custom.filter(active).map(email);",
      name: "accept a custom object with filter and map methods",
    },
    {
      code: "function collect(unknownReceiver) { return unknownReceiver.filter(active).map(email); }",
      name: "accept a parameter without a type",
    },
    {
      code: "const users = fetchUsers(); users.filter(active).map(email);",
      name: "accept a binding from an unknown call",
    },
    {
      code: "const users = []; function collect(users) { return users.filter(active).map(email); }",
      name: "accept a parameter that shadows an array binding",
    },
    {
      code: "let users = []; users = iterator; users.filter(active).map(email);",
      name: "accept a binding that the code reassigns to an iterator",
    },
    {
      code: "let users: Iterable<User> = []; users = iterator; users.filter(active).map(email);",
      name: "accept a reassigned variable with an annotation that is not an array",
    },
    {
      code: "const users = []; users[method](active).map(email);",
      name: "accept a computed method name",
    },
    {
      code: `const users = []; users[\`\${method}\`](active).map(email);`,
      name: "accept a template literal method name with an expression",
    },
    {
      code: "function collect(users: Lib.Array<User>) { return users.filter(active).map(email); }",
      name: "accept a namespace type named Array",
    },
    {
      code: "const first = second; const second = first; first.filter(active).map(email);",
      name: "accept bindings that refer to each other",
    },
  ],
})
