import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { userQuery } from "./queries"

export function NameField() {
  const query = useQuery(userQuery)
  const [edited, setEdited] = useState<string | undefined>(undefined)

  return (
    <input
      onChange={(event) => setEdited(event.target.value)}
      value={edited ?? query.data?.name ?? ""}
    />
  )
}
