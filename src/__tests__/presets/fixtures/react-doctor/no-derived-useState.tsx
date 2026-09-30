import { useState } from "react"

export function Greeting({ name }: { name: string }) {
  const [label, setLabel] = useState(name)
  return (
    <button onClick={() => setLabel("Guest")} type="button">
      {label}
    </button>
  )
}
