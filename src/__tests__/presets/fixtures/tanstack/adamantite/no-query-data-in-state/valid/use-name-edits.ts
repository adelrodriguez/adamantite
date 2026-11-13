import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { userQuery } from "../modules/queries"

export function useNameEdits() {
  const query = useQuery(userQuery)
  const [edited, setEdited] = useState<string>()

  return { name: edited ?? query.data?.name ?? "", setEdited }
}
