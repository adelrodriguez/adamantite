import type { InjectionKey, Ref } from "vue"
import { inject, provide } from "vue"

const counterKey: InjectionKey<Ref<number>> = Symbol("counter")

export function provideCounter(count: Ref<number>) {
  provide(counterKey, count)
}

export function useCounterContext() {
  const count = inject(counterKey)

  if (count === undefined) {
    throw new Error("Counter provider is missing")
  }

  return count
}
