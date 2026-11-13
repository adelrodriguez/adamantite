declare const value: unknown
declare function it(name: string, run: () => void): void

it('reads a flag', () => {
  // SAFETY: The test owns this input.
  if (value as boolean) {
    throw new Error('unexpected flag')
  }
})
