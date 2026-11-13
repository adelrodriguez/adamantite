import type { ZodRawShape } from "zod"
import type * as Z from "zod"

import { draw, UserSchema } from "./external"

export type Fields = ZodRawShape
export type FieldNames = keyof typeof UserSchema.shape
export type RawFields = Z.ZodRawShape
export const { shape: fields } = UserSchema
export const circle = draw({ shape: "circle" })
