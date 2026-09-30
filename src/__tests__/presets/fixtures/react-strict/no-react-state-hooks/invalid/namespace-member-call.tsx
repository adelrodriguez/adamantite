import * as React from "react"

export function Online() {
  const online = React.useSyncExternalStore(
    () => () => {},
    () => navigator.onLine
  )

  return <p>{online ? "Online" : "Offline"}</p>
}
