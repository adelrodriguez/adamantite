import { createContext } from "react"

const Context = createContext(null)

export function App() {
  return <Context.Provider value={null}><p>App</p></Context.Provider>
}
