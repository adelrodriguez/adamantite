export function outer<T>(items: readonly T[]) {
  function inner() {
    type T = string | number

    function show(value: T) {
      return typeof value === "string" ? value : value.toFixed(2)
    }

    return show
  }

  return { inner, items }
}
