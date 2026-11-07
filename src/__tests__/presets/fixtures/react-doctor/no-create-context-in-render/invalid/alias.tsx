import { createContext as makeContext } from "react"

export function App() {
  const Context = makeContext(null)
  return <Context.Provider value={null}><p>App</p></Context.Provider>
}
