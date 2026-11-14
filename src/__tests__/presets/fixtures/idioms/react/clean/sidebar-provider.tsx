import { createContext, type ReactNode } from "react"

interface SidebarValue {
  open: boolean
}

export const SidebarContext = createContext<SidebarValue | null>(null)

export function SidebarProvider({ children, open }: { children: ReactNode; open: boolean }) {
  return <SidebarContext.Provider value={{ open }}>{children}</SidebarContext.Provider>
}
