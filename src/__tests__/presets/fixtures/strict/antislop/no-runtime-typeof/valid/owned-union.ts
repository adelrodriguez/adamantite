type RetryPolicy = {
  readonly delay: number
  readonly attempts: number
}

export function retryDelay(retry: number | RetryPolicy): number {
  return typeof retry === 'number' ? retry : retry.delay
}
