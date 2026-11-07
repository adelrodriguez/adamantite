export function Download({ data }: { data: Blob }) {
  function download() {
    const url = URL.createObjectURL(data)
    URL.revokeObjectURL(url)
  }
  return <button onClick={download} type="button">Download</button>
}
