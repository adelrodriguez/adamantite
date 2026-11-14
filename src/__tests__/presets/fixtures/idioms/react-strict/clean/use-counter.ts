import { useState, useEffect } from "react"

export function useCounter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    function increment() {
      setCount((value) => value + 1)
    }

    globalThis.addEventListener("counter", increment)

    return () => {
      globalThis.removeEventListener("counter", increment)
    }
  }, [])

  return { count, setCount }
}
