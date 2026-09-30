import { useState } from "react"

export function Todos() {
  const [items, setItems] = useState<string[]>([])
  function add() {
    items.push("new")
    setItems(items)
  }
  return (
    <button onClick={add} type="button">
      {items.length}
    </button>
  )
}
