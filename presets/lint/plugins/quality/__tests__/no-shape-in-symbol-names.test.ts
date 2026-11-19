import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "forbiddenSymbolName" }

tester.run("no-shape-in-symbol-names", plugin.rules["no-shape-in-symbol-names"], {
  invalid: [
    { code: "const shape = 1;", errors: [error], name: "report a variable named shape" },
    {
      code: "function shapeOf() {}",
      errors: [error],
      name: "report a function name that starts with shape",
    },
    {
      code: "type PayloadShape = { id: string };",
      errors: [error],
      name: "report a type alias name that ends with Shape",
    },
    {
      code: "type Payload = { shape: string };",
      errors: [error],
      name: "report a shape property in a type literal",
    },
    {
      code: "declare const owner: External; const shape = 'field'; const value = owner[shape];",
      errors: 1,
      name: "report a declaration once and not its references",
    },
    {
      code: "const userShape = 1; export const copy = userShape;",
      errors: 1,
      name: "report a declaration once and not its exports",
    },
    { code: "type FormShape = {};", errors: [error], name: "report a type alias named FormShape" },
    {
      code: "interface ShapeProps {}",
      errors: [error],
      name: "report an interface name that starts with Shape",
    },
    {
      code: "function toShape() {}",
      errors: [error],
      name: "report a function name that ends with Shape",
    },
    { code: "class Shape {}", errors: 1, name: "report a class named Shape" },
    {
      code: "export const make = class Shape {};",
      errors: 1,
      name: "report a named class expression",
    },
    {
      code: "export const make = function toShape() {};",
      errors: 1,
      name: "report a named function expression",
    },
    {
      code: "export function draw(shape: string) { return shape; }",
      errors: 1,
      name: "report a parameter named shape",
    },
    {
      code: "export const draw = ({ shape }: Options) => shape;",
      errors: 1,
      name: "report a destructured parameter named shape",
    },
    {
      code: "declare const UserSchema: Schema; const { shape } = UserSchema;",
      errors: 1,
      name: "report a shape property kept by destructuring",
    },
    { code: "try {} catch (shapeError) {}", errors: [error], name: "report a catch parameter" },
    { code: "enum Kind { Shape }", errors: [error], name: "report an enum member" },
    { code: "type Wrap<TShape> = TShape;", errors: 1, name: "report a type parameter" },
    { code: "namespace Shapes {}", errors: [error], name: "report a namespace" },
    {
      code: "type Draw = (shape: string) => void;",
      errors: [error],
      name: "report a parameter of a function type",
    },
    {
      code: "interface Canvas { shape: string; toShape(): void }",
      errors: 2,
      name: "report each interface member",
    },
    {
      code: "class Canvas { shape = 1; #shapeCache = 2; toShape() {} }",
      errors: 3,
      name: "report each class member, including a private one",
    },
    {
      code: "abstract class Canvas { abstract shape: string }",
      errors: [error],
      name: "report an abstract class property",
    },
    {
      code: "import { a as userShape } from 'lib';",
      errors: [error],
      name: "report a renamed import",
    },
    {
      code: "import { Shape as LocalShape } from 'lib';",
      errors: [error],
      name: "report a local alias of an import named Shape",
    },
    {
      code: "import Shape from 'lib';",
      errors: [error],
      name: "report a default import named Shape",
    },
    { code: "import * as Shapes from 'lib';", errors: [error], name: "report a namespace import" },
    {
      code: "const fields = 1; export { fields as userShape };",
      errors: [error],
      name: "report an export alias",
    },
  ],
  valid: [
    {
      code: "declare const schema: ExternalSchema; const field = schema.shape.id;",
      name: "accept a shape property of an external schema",
    },
    {
      code: "declare const outer: External; const value = outer.inner.shape;",
      name: "accept a shape property of an external object",
    },
    {
      code: "declare const schema: ExternalSchema; schema.shape.id.parse('x');",
      name: "accept a member call through an external shape property",
    },
    {
      code: "const owner = { id: 1 }; const value = owner.id;",
      name: "accept a name without shape",
    },
    {
      code: "import type { ZodRawShape } from 'zod'; export type Fields = ZodRawShape;",
      name: "accept an imported type whose name has Shape",
    },
    {
      code: "import type { ZodRawShape as ZodFields } from 'zod'; export type Fields = ZodFields;",
      name: "accept a renamed imported type whose name has Shape",
    },
    {
      code: "import { ZodRawShape } from 'zod'; export { ZodRawShape };",
      name: "accept a re-export of an imported name with Shape",
    },
    {
      code: "declare const UserSchema: Schema; type F1 = keyof typeof UserSchema.shape;",
      name: "accept typeof of a schema shape",
    },
    {
      code: "import type * as Z from 'zod'; type F2 = Z.ZodRawShape;",
      name: "accept a namespace member whose name has Shape",
    },
    {
      code: "type F3 = typeof import('zod').ZodRawShape;",
      name: "accept an import type member whose name has Shape",
    },
    {
      code: "declare const UserSchema: Schema; const { shape: fields } = UserSchema;",
      name: "accept a shape property renamed by destructuring",
    },
    {
      code: "declare function draw(options: Options): void; draw({ shape: 'circle' });",
      name: "accept a shape key in an argument to a declared function",
    },
    { code: "export { ZodRawShape } from 'zod';", name: "accept a re-export from another module" },
    {
      code: "import { Button } from 'ui'; export const view = <Button shape='round' />;",
      languageOptions: { parserOptions: { lang: "tsx" } },
      name: "accept a shape JSX attribute",
    },
    {
      code: "import Konva from 'konva'; export const view = <Konva.Shape />;",
      languageOptions: { parserOptions: { lang: "tsx" } },
      name: "accept a JSX member element named Shape",
    },
  ],
})
