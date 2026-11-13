---
"adamantite": patch
---

Stop telling the author how to write a module mock in the vitest and jest presets

The vitest lint preset no longer turns on `vitest/prefer-import-in-mock`, and the jest lint preset no longer turns on `jest/no-untyped-mock-factory`. The rules told the author to write `vi.mock(import("./load.ts"))` or to add a type parameter to a `jest.mock` factory, but the strict preset's `anti-slop/no-module-mocking` bans each module mock. So a project with strict got two reports on one `vi.mock` or `jest.mock` call, and the code that obeyed the first report still failed the check. A project without the strict preset can turn the rules on in its own `oxlint.config.ts`.
