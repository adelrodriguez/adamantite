import { useEffect, useState } from "react"

export function Toggle({ onChange }: { onChange: (isOn: boolean) => void }) {
  const [isOn, setIsOn] = useState(false)
  useEffect(() => {
    onChange(isOn)
  }, [isOn, onChange])
  return (
    <button onClick={() => setIsOn(!isOn)} type="button">
      Toggle
    </button>
  )
}
