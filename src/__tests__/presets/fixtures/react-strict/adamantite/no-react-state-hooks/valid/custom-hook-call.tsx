import { useCounter } from "./useCounter"

export function Counter() {
  const [count] = useCounter()

  return <p>{count}</p>
}
