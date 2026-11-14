export function settle(task: Promise<number>): Promise<string> {
  return task.then((value: unknown) => String(value))
}
