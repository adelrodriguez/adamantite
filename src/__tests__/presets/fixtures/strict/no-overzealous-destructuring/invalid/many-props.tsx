interface Props {
  city: string
  country: string
  line1: string
  line2: string
  name: string
  postalCode: string
}

export function Address({ city, country, line1, line2, name, postalCode }: Props) {
  return (
    <address>
      {name} {line1} {line2} {postalCode} {city} {country}
    </address>
  )
}
