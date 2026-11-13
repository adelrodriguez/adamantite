import type { ZodRawShape } from "../modules/zod"
import type * as Z from "../modules/zod"

import { draw, UserSchema } from "../modules/schema"

export type Fields = ZodRawShape

export type FieldNames = keyof typeof UserSchema.shape

export type RawFields = Z.ZodRawShape

export const { shape: fields } = UserSchema

export const circle = draw({ shape: "circle" })
