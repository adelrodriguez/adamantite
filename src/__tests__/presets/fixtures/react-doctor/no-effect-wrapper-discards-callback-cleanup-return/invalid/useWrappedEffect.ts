import { useEffect, type EffectCallback } from "react"

export function useWrappedEffect(effect: EffectCallback) {
  useEffect(() => { effect() }, [effect])
}
