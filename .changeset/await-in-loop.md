---
"adamantite": patch
---

Accept an `await` in a loop in the core preset

The core lint preset no longer enables `no-await-in-loop`. The rule told the author to start the calls together, and that is a defect when each call needs the result of the call before it, such as a retry, a lock order, or a page that depends on the page before it. Suppressions that name `no-await-in-loop` are now unused, so you can delete them.
