declare const value: unknown
declare function it(name: string, run: () => void): void

// SAFETY: The test owns this input.
it('reads a flag', () => {
  if (value as boolean) {
    throw new Error('unexpected flag')
  }
})
