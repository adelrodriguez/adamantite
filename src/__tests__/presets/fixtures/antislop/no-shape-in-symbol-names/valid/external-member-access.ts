import type { ExternalSchema } from './external'

declare const schema: ExternalSchema
export const field = schema.shape.id
