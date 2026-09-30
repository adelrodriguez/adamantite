import { useReducer as useStore } from "react"

export function Cart() {
  const [items] = useStore((state: string[], item: string) => [...state, item], [])

  return <p>{items.length}</p>
}
