import React from "react"

export function Title({ title }: { title: string }) {
  React.useEffect(() => {
    document.title = title
  }, [title])

  return <h1>{title}</h1>
}
