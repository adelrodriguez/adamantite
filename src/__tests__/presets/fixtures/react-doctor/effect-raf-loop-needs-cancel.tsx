import { useEffect } from "react"

export function Animation() {
  useEffect(() => {
    function tick() {
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [])
  return <div />
}
