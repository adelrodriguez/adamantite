import type { ReactNode } from "react"

export const metadata = { description: "A todo list", title: "Todos" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
