import { useState } from "react"

export function Counter() {
  const useState = (initial: number) => [initial]
  const [count] = useState(0)

  return <p>{count}</p>
}
