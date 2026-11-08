import { useEffect, useRef } from "react"

export function Watched() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const observer = new ResizeObserver(() => {})
    if (ref.current) {
      observer.observe(ref.current)
    }
  }, [])
  return <div ref={ref} />
}
