import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/anti-slop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "forbiddenSymbolName" }

tester.run("no-shape-in-symbol-names", plugin.rules["no-shape-in-symbol-names"], {
  invalid: [
    { code: "const shape = 1;", errors: [error] },
    { code: "function shapeOf() {}", errors: [error] },
    { code: "type PayloadShape = { id: string };", errors: [error] },
    { code: "type Payload = { shape: string };", errors: [error] },
    // The rule reports a declaration once, not each reference to it.
    {
      code: "declare const owner: External; const shape = 'field'; const value = owner[shape];",
      errors: 1,
    },
    { code: "const userShape = 1; export const copy = userShape;", errors: 1 },
    { code: "type FormShape = {};", errors: [error] },
    { code: "interface ShapeProps {}", errors: [error] },
    { code: "function toShape() {}", errors: [error] },
    { code: "class Shape {}", errors: 1 },
    { code: "export const make = class Shape {};", errors: 1 },
    { code: "export const make = function toShape() {};", errors: 1 },
    { code: "export function draw(shape: string) { return shape; }", errors: 1 },
    { code: "export const draw = ({ shape }: Options) => shape;", errors: 1 },
    { code: "declare const UserSchema: Schema; const { shape } = UserSchema;", errors: 1 },
    { code: "try {} catch (shapeError) {}", errors: [error] },
    { code: "enum Kind { Shape }", errors: [error] },
    { code: "type Wrap<TShape> = TShape;", errors: 1 },
    { code: "namespace Shapes {}", errors: [error] },
    { code: "type Draw = (shape: string) => void;", errors: [error] },
    { code: "interface Canvas { shape: string; toShape(): void }", errors: 2 },
    { code: "class Canvas { shape = 1; #shapeCache = 2; toShape() {} }", errors: 3 },
    { code: "abstract class Canvas { abstract shape: string }", errors: [error] },
    { code: "import { a as userShape } from 'lib';", errors: [error] },
    { code: "import { Shape as LocalShape } from 'lib';", errors: [error] },
    { code: "import Shape from 'lib';", errors: [error] },
    { code: "import * as Shapes from 'lib';", errors: [error] },
    { code: "const fields = 1; export { fields as userShape };", errors: [error] },
  ],
  valid: [
    "declare const schema: ExternalSchema; const field = schema.shape.id;",
    "declare const outer: External; const value = outer.inner.shape;",
    "declare const schema: ExternalSchema; schema.shape.id.parse('x');",
    "const owner = { id: 1 }; const value = owner.id;",
    // A name that another module declares is not this file's choice.
    "import type { ZodRawShape } from 'zod'; export type Fields = ZodRawShape;",
    "import type { ZodRawShape as ZodFields } from 'zod'; export type Fields = ZodFields;",
    "import { ZodRawShape } from 'zod'; export { ZodRawShape };",
    "declare const UserSchema: Schema; type F1 = keyof typeof UserSchema.shape;",
    "import type * as Z from 'zod'; type F2 = Z.ZodRawShape;",
    "type F3 = typeof import('zod').ZodRawShape;",
    "declare const UserSchema: Schema; const { shape: fields } = UserSchema;",
    "declare function draw(options: Options): void; draw({ shape: 'circle' });",
    "export { ZodRawShape } from 'zod';",
    {
      code: "import { Button } from 'ui'; export const view = <Button shape='round' />;",
      languageOptions: { parserOptions: { lang: "tsx" } },
    },
    {
      code: "import Konva from 'konva'; export const view = <Konva.Shape />;",
      languageOptions: { parserOptions: { lang: "tsx" } },
    },
  ],
})
