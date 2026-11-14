export function settle(task: Promise<number>): Promise<number | string> {
  return task.catch((error: unknown) => `failed: ${String(error)}`)
}
