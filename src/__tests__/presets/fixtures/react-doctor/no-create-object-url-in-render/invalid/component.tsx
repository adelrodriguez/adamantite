export function Preview({ data }: { data: Blob }) {
  const url = URL.createObjectURL(data)
  return <a href={url}>Download</a>
}
