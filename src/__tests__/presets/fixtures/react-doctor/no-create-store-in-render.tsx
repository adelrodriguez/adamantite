import { create } from "zustand"

export function Panel() {
  const useStore = create(() => ({ count: 0 }))
  return <p>{String(useStore)}</p>
}
