export function settle(task: Promise<number>): Promise<number | string> {
  return task.then(
    (value) => value,
    (error: unknown) => `failed: ${String(error)}`
  )
}
