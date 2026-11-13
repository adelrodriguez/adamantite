declare const value: unknown

export function rejectFlag(): void {
  // SAFETY: The test owns this input.
  if (value as boolean) {
    throw new Error("unexpected flag")
  }
}
