"use client"

import { useCounter } from "./use-counter.js"

export default function Counter() {
  const counter = useCounter()

  return (
    <button
      type="button"
      onClick={() => {
        counter.setCount(counter.count + 1)
      }}
    >
      {counter.count}
    </button>
  )
}
