function describe(error: unknown): string {
  return String(error)
}

export function settle(task: Promise<number>): Promise<number | string> {
  return task.catch(describe)
}
