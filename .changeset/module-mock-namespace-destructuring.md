---
"adamantite": minor
---

Let `anti-slop/no-module-mocking` report mocks through a namespace import or a destructured method

The strict preset now reports `vitest.vi.mock(...)` after `import * as vitest from "vitest"`, the same form for `@jest/globals`, and a mock method that the code destructures from `vi` or `jest`, such as `const { doMock } = vi`. It also follows `const` aliases of `vi`, `jest`, and their mock methods, and reads `globalThis.vi`. An import of `vi` from your own module, such as `import { vi } from "./helpers"`, is still allowed.
