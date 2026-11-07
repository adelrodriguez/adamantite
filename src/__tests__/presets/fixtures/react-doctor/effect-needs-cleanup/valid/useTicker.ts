import { useEffect } from "react"

declare function tick(): void

export function useTicker() {
  useEffect(() => {
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
}
