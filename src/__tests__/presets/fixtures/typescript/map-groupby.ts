import { doNotExecute, Equal, Expect } from "./utils";

// Basic: grouped values are non-empty tuples
doNotExecute(() => {
  const items = ["a", "b", "c", "d"];
  const grouped = Map.groupBy(items, (letter) => letter.charCodeAt(0) % 2);

  grouped.forEach((group) => {
    type test = Expect<Equal<typeof group, [string, ...string[]]>>;

    // First element should be `string`, not `string | undefined`
    const first = group[0];
    type test2 = Expect<Equal<typeof first, string>>;
  });
});

// Assignability: grouped values should be assignable to T[]
doNotExecute(() => {
  const grouped = Map.groupBy(["a", "b"], (x) => x.length);

  const acceptsArray = (arr: string[]) => {};

  grouped.forEach((group) => {
    acceptsArray(group);
  });
});

// Destructuring: first element is T, rest is T[]
doNotExecute(() => {
  const grouped = Map.groupBy([1, 2, 3], (x) => x % 2);

  grouped.forEach((group) => {
    const [first, ...rest] = group;
    type test1 = Expect<Equal<typeof first, number>>;
    type test2 = Expect<Equal<typeof rest, number[]>>;
  });
});

// Union element types
doNotExecute(() => {
  const items: (string | number)[] = ["a", 1, "b", 2];
  const grouped = Map.groupBy(items, (item) => typeof item);

  grouped.forEach((group) => {
    type test = Expect<
      Equal<typeof group, [string | number, ...(string | number)[]]>
    >;
  });
});

// String keys
doNotExecute(() => {
  const items = [
    { name: "Alice", role: "admin" },
    { name: "Bob", role: "user" },
  ];
  const grouped = Map.groupBy(items, (item) => item.role);

  grouped.forEach((group) => {
    type test = Expect<
      Equal<typeof group, [(typeof items)[number], ...(typeof items)[number][]]>
    >;
  });
});
