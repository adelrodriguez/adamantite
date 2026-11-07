import { useEffect } from "react"

declare const appEvent: { subscribe(handler: () => void): void; unsubscribe(handler: () => void): void }
declare function handle(): void

export function useSubscription() {
  useEffect(() => {
    appEvent.subscribe(() => { handle() })
    return () => { appEvent.unsubscribe(() => { handle() }) }
  }, [])
}
