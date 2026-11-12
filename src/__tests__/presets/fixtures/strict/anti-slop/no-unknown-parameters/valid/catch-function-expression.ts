export function settle(task: Promise<number>): Promise<number | string> {
  return task.catch(function describe(error: unknown) {
    return String(error)
  })
}
