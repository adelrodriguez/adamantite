import { useState } from "react"

class Store {}

export function Holder() {
  const [store, setStore] = useState(new Store())
  return (
    <button onClick={() => setStore(new Store())} type="button">
      {String(store)}
    </button>
  )
}
