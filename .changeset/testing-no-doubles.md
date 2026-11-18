---
"adamantite": minor
---

Report mock implementations and stubbed globals in the strict preset with `testing/no-doubles`

`testing/no-doubles` now reports each Vitest or Jest test double that replaces what a dependency does, not only a module mock:

- A mock implementation: `vi.fn(impl)`, `jest.fn(impl)`, and `mockImplementation`, `mockReturnValue`, `mockResolvedValue`, `mockRejectedValue`, their `Once` forms, `mockReturnThis`, and `withImplementation`.
- A stubbed global or property: `vi.stubGlobal()` and `jest.replaceProperty()`.
- A spy result for some arguments: `vi.when()`.
- A module or an object of mocks: `vi.importMock()`, `vi.mockObject()`, `jest.createMockFromModule()`, `jest.genMockFromModule()`, `jest.setMock()`, and `jest.enableAutomock()`.

A spy, such as `vi.spyOn(store, "save")`, and `vi.fn()` without an implementation only observe the real code, so they stay allowed. To fix a report, pass a test implementation through the dependency's interface, such as an Effect `Layer` or a function parameter.

The jest and vitest presets turn off `prefer-mock-promise-shorthand` and `prefer-mock-return-shorthand`. They asked for `mockResolvedValue` and `mockReturnValue` in place of a mock implementation, but the strict preset reports both forms. A project without the strict preset can turn the rules on in its own `oxlint.config.ts`. Suppressions that name these rules are unused, so you can delete them.
