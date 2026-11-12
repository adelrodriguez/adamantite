import { doNotExecute, Equal, Expect } from "./utils";

doNotExecute(() => {
  const result = eval("1 + 1");

  type tests = [Expect<Equal<typeof result, unknown>>];
});
