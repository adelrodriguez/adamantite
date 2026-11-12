import { doNotExecute, Equal, Expect } from "./utils";

doNotExecute(() => {
  const result = JSON.parse("{}");

  type tests = [Expect<Equal<typeof result, unknown>>];
});

doNotExecute(() => {
  // Make tests fail when someone tries to PR JSON.parse<T>

  // @ts-expect-error
  const result = JSON.parse<string>("{}");
});

// A reviver gets unknown values, not any.
doNotExecute(() => {
  JSON.parse("{}", function (key, value) {
    type tests = [
      Expect<Equal<typeof key, string>>,
      Expect<Equal<typeof value, unknown>>,
      Expect<Equal<typeof this, unknown>>,
    ];

    return value;
  });
});

// An annotated reviver also gives an unknown result, not the library's any.
doNotExecute(() => {
  const annotated = JSON.parse('{"x":1}', (_key, value: number) => value);
  const annotatedThis = JSON.parse('{"x":1}', function (this: { x: number }, _key, value) {
    return value;
  });

  type tests = [
    Expect<Equal<typeof annotated, unknown>>,
    Expect<Equal<typeof annotatedThis, unknown>>,
  ];
});
