---
"adamantite": minor
---

Check `require()`, `import x = require()`, and fixed `import()` sources in `adamantite/layers` and `adamantite/import-owners`

Both rules checked an `import()` only when its source was a plain string, and did not check CommonJS or TypeScript import-equals imports. Each of these imports could cross a layer or reach a restricted module without a report. Both rules now check:

- `import()` with a template that has no expression, such as ``import(`../high/api.ts`)``.
- `import()` with a string inside `as`, `satisfies`, `!`, or `<T>` assertions, such as `import("../high/api.ts" as string)`.
- `require("../high/api.ts")`, unless the file declares its own `require`.
- `import api = require("../high/api.ts")`, `export import api = require(...)`, and `import type api = require(...)`.

A source that only running the code gives, such as a variable or a template with `${}`, is still not checked. `require()` and `import x = require()` resolve with the `require` condition of a package's `exports` and `imports`. In `adamantite/layers`, `import type x = require()` follows `ignoreTypes`. In `adamantite/import-owners`, `require()` and `import x = require()` reach every export of the module, as `import()` does, so they are reported when the option restricts only some names.

A project can get new reports where these imports cross a boundary. Move the import to an allowed layer or to an owner, as for a static import.
