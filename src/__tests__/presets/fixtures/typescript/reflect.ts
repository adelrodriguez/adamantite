import { doNotExecute, Equal, Expect } from "./utils";

doNotExecute(() => {
  const max = Reflect.apply(Math.max, undefined, [1, 2]);
  const date = Reflect.construct(Date, []);

  type tests = [
    Expect<Equal<typeof max, unknown>>,
    Expect<Equal<typeof date, unknown>>,
  ];
});
