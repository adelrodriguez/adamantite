import { useEffect } from "react"

export function usePreview(data: Blob) {
  useEffect(() => {
    const url = URL.createObjectURL(data)
    return () => URL.revokeObjectURL(url)
  }, [data])
}
