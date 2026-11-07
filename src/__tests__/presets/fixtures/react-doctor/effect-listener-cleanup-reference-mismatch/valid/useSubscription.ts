import { useEffect } from "react"

declare const appEvent: { subscribe(handler: () => void): void; unsubscribe(handler: () => void): void }
declare function handle(): void

export function useSubscription() {
  useEffect(() => {
    const handler = () => { handle() }
    appEvent.subscribe(handler)
    return () => { appEvent.unsubscribe(handler) }
  }, [])
}
