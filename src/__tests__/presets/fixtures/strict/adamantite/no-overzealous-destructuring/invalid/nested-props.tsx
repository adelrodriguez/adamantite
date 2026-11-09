interface Props {
  order: { customer: { address: { city: string } } }
}

export function City({
  order: {
    customer: { address },
  },
}: Props) {
  return <p>{address.city}</p>
}
