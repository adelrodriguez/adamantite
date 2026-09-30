import { useEffect } from "react"

export function Product({ isInCart }: { isInCart: boolean }) {
  useEffect(() => {
    if (isInCart) {
      alert("Added to the cart")
    }
  }, [isInCart])
  return <p>Product</p>
}
