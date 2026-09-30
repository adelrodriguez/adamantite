import { useEffect, useState } from "react"

declare function loadUser(id: string): Promise<string>

export function User({ id }: { id: string }) {
  const [user, setUser] = useState("")
  useEffect(() => {
    async function load() {
      const value = await loadUser(id)
      setUser(value)
    }
    void load()
  }, [id])
  return <p>{user}</p>
}
