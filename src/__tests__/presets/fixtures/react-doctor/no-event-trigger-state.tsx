import { useEffect, useState } from "react"

declare function post(url: string): Promise<void>

export function Form() {
  const [submitted, setSubmitted] = useState(false)
  useEffect(() => {
    if (submitted) {
      void post("/api/submit")
    }
  }, [submitted])
  return (
    <button onClick={() => setSubmitted(true)} type="button">
      Submit
    </button>
  )
}
