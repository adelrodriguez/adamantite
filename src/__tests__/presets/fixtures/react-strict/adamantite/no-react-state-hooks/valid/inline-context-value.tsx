import { createContext, type ReactNode } from "react"

interface Theme {
  mode: string
}

export const ThemeContext = createContext<Theme | null>(null)

export function ThemeProvider({ children, mode }: { children: ReactNode; mode: string }) {
  return <ThemeContext.Provider value={{ mode }}>{children}</ThemeContext.Provider>
}
