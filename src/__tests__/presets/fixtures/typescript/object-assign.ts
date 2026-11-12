import { doNotExecute, Equal, Expect } from "./utils";

// Up to three sources keep their types.
doNotExecute(() => {
  const merged = Object.assign({ a: 1 }, { b: "x" });
  const three: { a: number; b: string; c: boolean } = Object.assign(
    {},
    { a: 1 },
    { b: "x" },
    { c: true },
  );

  type tests = [Expect<Equal<typeof merged, { a: number } & { b: string }>>];
});

// More sources, or an array of sources, give unknown, not any.
doNotExecute(() => {
  const sources = [{ a: 1 }];
  const spread = Object.assign({}, ...sources);
  const four = Object.assign({}, { a: 1 }, { b: 2 }, { c: 3 }, { d: 4 });

  type tests = [
    Expect<Equal<typeof spread, unknown>>,
    Expect<Equal<typeof four, unknown>>,
  ];
});
