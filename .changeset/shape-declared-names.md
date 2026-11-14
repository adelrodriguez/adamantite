---
"adamantite": patch
---

Report only the names that a file declares in `antislop/no-shape-in-symbol-names`

The rule now checks the bindings, types, and members that a file declares, and a renamed import or export. It no longer reports a name that comes from another module, such as `import type { ZodRawShape } from "zod"`, `UserSchema.shape`, a JSX attribute, or an object key passed to another library. It reports each declaration once, not once for each reference.
