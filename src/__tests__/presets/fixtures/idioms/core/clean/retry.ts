export async function runOperation(operation: () => Promise<string>) {
  try {
    return await operation()
  } catch (error) {
    throw new Error("Operation failed", { cause: error })
  }
}
