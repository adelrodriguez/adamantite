export type Payload<T> = T extends string ? Record<string, unknown> : never
