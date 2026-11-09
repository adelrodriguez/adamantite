import { useId, useRef } from "react"

export function Field() {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)

  return <input id={id} ref={input} />
}
