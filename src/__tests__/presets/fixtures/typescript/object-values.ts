import { doNotExecute, Equal, Expect } from "./utils";

interface Settings {
  size: number;
  theme: string;
}

// A type without an index signature gives unknown values, not any.
doNotExecute(() => {
  const settings: Settings = { size: 1, theme: "dark" };
  const values = Object.values(settings);
  const entries = Object.entries(settings);

  type tests = [
    Expect<Equal<typeof values, unknown[]>>,
    Expect<Equal<typeof entries, [string, unknown][]>>,
  ];
});

// An index signature keeps its value type.
doNotExecute(() => {
  const record: Record<string, number> = { a: 1 };
  const values = Object.values(record);
  const entries = Object.entries(record);

  type tests = [
    Expect<Equal<typeof values, number[]>>,
    Expect<Equal<typeof entries, [string, number][]>>,
  ];
});

// An array keeps its element type.
doNotExecute(() => {
  const values = Object.values(["a", "b"]);
  const entries = Object.entries(["a", "b"]);

  type tests = [
    Expect<Equal<typeof values, string[]>>,
    Expect<Equal<typeof entries, [string, string][]>>,
  ];
});
