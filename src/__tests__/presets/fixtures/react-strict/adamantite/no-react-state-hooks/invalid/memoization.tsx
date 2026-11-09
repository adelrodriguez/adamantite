import { useMemo } from "react"

export function Total({ prices }: { prices: number[] }) {
  const total = useMemo(() => prices.reduce((sum, price) => sum + price, 0), [prices])

  return <p>{total}</p>
}
