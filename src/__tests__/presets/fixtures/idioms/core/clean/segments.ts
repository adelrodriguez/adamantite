export function labelSegments(input: string) {
  const result: string[] = []

  for (const [index, segment] of input.split("/").entries()) {
    result.push(`${index}:${segment}`)
  }

  return result
}
