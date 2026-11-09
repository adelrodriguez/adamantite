import { useReducer } from "react"

export function useCart() {
  return useReducer((items: string[], item: string) => [...items, item], [])
}
