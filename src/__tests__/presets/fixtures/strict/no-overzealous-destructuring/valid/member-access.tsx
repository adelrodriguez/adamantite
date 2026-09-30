interface Props {
  address: {
    city: string
    country: string
    line1: string
    line2: string
    name: string
    postalCode: string
  }
}

export function Address({ address }: Props) {
  return (
    <address>
      {address.name} {address.line1} {address.line2} {address.postalCode} {address.city}{" "}
      {address.country}
    </address>
  )
}
