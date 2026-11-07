import * as React from "react"

export function App() {
  const Context = React.createContext(null)
  return <Context.Provider value={null}><p>App</p></Context.Provider>
}
