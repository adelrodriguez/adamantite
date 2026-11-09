import { useSuspenseQuery } from "@tanstack/react-query"
import { useState } from "react"
import { userQuery } from "./queries"

export function NameField() {
  const { data: user } = useSuspenseQuery(userQuery)
  const [draft, setDraft] = useState(() => user)

  return <input onChange={(event) => setDraft({ ...draft, name: event.target.value })} value={draft.name} />
}
