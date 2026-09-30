import { useState } from "react"

export function UserProfile() {
  const [name] = useState("Ada")

  return <p>{name}</p>
}
