declare function load(first: string, second: string, third: string, fourth: string): number

export function run(): number {
  const a = 1

  const b =
    load("first argument value", "second argument value", "third argument value", "fourth value")
    + a

  return b
}
