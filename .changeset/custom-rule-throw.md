---
"adamantite": patch
---

Correct what the Adamantite skill and the README say about a custom rule that throws

The skill and the README said that a custom rule that throws prints an error for each file while Oxlint still exits 0. That is false. When a rule throws in a visitor, or in `before` or `after`, Oxlint fails the lint run and reports `Error running JS plugin`, with the stack of the throw, for each file in which the rule throws. For those files, Oxlint omits the reports of every other rule that a JavaScript plugin provides, such as the other custom rules and `adamantite/layers`. Its native rules still report. A throw in the `createOnce` body, or while the rule file loads, stops Oxlint with `Failed to load JS plugin` before it lints a file.

The skill now tells agents to fix the throw first, and to run lint again before they trust the remaining reports. Oxlint 1.92.0 and 1.94.0 behave this way for a throw in a visitor. The other cases were checked with Oxlint 1.94.0.
