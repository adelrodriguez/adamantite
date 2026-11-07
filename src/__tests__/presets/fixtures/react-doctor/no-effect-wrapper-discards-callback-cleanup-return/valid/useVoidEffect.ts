import { useEffect } from "react"

export function useVoidEffect(effect: () => void) {
  useEffect(() => { effect() }, [effect])
}
