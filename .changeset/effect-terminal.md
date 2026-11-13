---
"adamantite": minor
---

Use Effect's prompts and console for the terminal, and remove the runtime dependency `@clack/prompts`. Questions now show `? message ›`, and each answer shows `✔ message … answer`. Status lines start with a symbol, such as `✔ Dependencies installed.`, and no guide line runs at the left edge. Each step prints one line when it finishes, without a spinner. The error that ends a command now goes to standard error.
