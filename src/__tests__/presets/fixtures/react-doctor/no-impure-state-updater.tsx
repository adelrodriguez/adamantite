import { useState } from "react"

export function Counter() {
  const [count, setCount] = useState(0)
  function increment() {
    setCount((value) => {
      localStorage.setItem("count", String(value + 1))
      return value + 1
    })
  }
  return (
    <button onClick={increment} type="button">
      {count}
    </button>
  )
}
