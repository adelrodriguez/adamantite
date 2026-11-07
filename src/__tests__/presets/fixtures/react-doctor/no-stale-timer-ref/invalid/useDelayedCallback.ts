import { useRef } from "react"

export function useDelayedCallback(callback: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function schedule() {
    if (timerRef.current) return
    timerRef.current = setTimeout(callback, 100)
  }
  function cancel() {
    if (timerRef.current) clearTimeout(timerRef.current)
  }
  return { cancel, schedule }
}
