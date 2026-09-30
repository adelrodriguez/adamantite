import { useEffect, useState } from "react"

export function User({ id }: { id: string }) {
  const [user, setUser] = useState<unknown>(null)
  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then((response) => response.json())
      .then(setUser)
      .catch(() => setUser(null))
  }, [id])
  return <p>{String(user)}</p>
}
