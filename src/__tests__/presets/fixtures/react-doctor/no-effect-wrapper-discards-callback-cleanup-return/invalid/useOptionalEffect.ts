import { useEffect } from "react"

export function useOptionalEffect(effect?: () => void | (() => void)) {
  useEffect(() => { effect?.() }, [effect])
}
