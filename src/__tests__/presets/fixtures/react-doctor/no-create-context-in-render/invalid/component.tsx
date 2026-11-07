import { createContext } from "react"

export function App() {
  const Context = createContext(null)
  return <Context.Provider value={null}><p>App</p></Context.Provider>
}
