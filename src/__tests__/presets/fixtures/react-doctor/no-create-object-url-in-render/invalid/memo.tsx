import { useMemo } from "react"

export function Preview({ data }: { data: Blob }) {
  const url = useMemo(() => URL.createObjectURL(data), [data])
  return <a href={url}>Download</a>
}
