import { shallowReadonly, shallowRef } from "vue"

export function useCounter(initialValue = 0) {
  const count = shallowRef(initialValue)
  const inc = (delta = 1) => (count.value += delta)
  const dec = (delta = 1) => (count.value -= delta)

  return { count: shallowReadonly(count), dec, inc }
}
