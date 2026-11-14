import { useSyncExternalStore } from "react"

export function useIsMobile(mobileBreakpoint = 768) {
  return useSyncExternalStore(
    (onChange) => {
      const media = globalThis.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`)
      media.addEventListener("change", onChange)

      return () => {
        media.removeEventListener("change", onChange)
      }
    },
    () => globalThis.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`).matches,
    () => false
  )
}
