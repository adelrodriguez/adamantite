export function total(values: readonly number[]) {
  const sum = values.reduce((acc, value) => acc + value, 0)
  return sum
}
