---
"adamantite": patch
---

Migrate CLI framework from Commander.js to citty for improved developer experience. This change brings better type safety through citty's TypeScript-first design, improved ergonomics as part of the UnJS ecosystem, and a more declarative command definition API.

Key improvements:
- **Better type safety**: Commands are now defined using `defineCommand()` with fully typed argument definitions
- **Declarative API**: Command metadata, arguments, and handlers are defined in a single, clear structure rather than chained method calls
- **Improved DX**: Arguments are automatically parsed and typed, with built-in support for positional arguments, boolean flags, and command metadata
- **UnJS ecosystem**: citty is part of the UnJS ecosystem, providing better compatibility with other modern JavaScript tooling and conventions
