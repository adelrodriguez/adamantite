import { doNotExecute, Equal, Expect } from "./utils";

doNotExecute(() => {
  const prototype = Object.getPrototypeOf(new Date());

  type tests = [Expect<Equal<typeof prototype, unknown>>];
});
