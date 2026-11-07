import { useEffect } from "react"

declare function tick(): void

export function useTicker() {
  useEffect(() => { setInterval(tick, 1000) }, [])
}
