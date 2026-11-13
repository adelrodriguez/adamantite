import { useCart } from "./use-cart"

export function Cart() {
  const [items] = useCart()

  return <p>{items.length}</p>
}
