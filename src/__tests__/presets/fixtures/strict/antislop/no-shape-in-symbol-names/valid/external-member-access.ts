import type { ExternalSchema } from "../modules/schema"

declare const schema: ExternalSchema

export const field = schema.shape.id
