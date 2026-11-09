import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { userQuery } from "./queries"

export function NameField() {
  const query = useQuery(userQuery)
  const [name, setName] = useState(query.data?.name ?? "")

  return <input onChange={(event) => setName(event.target.value)} value={name} />
}
