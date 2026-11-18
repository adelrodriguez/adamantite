---
"adamantite": minor
---

Give `adamantite harden` a decisions record, so a later session does not propose again what you rejected

After you answer a harden session, the coding agent writes each candidate that you did not approve, and each decision that you made, to `.adamantite/decisions.md` at the project root. In a monorepo, that is the workspace root. Each entry has the standard, the decision, the date, the reason, and the evidence that the session saw. An approved candidate gets no entry, because its rule or instruction is the trace. Commit the record.

The next session reads the record. A candidate that matches an entry goes to the "Also considered" list with a pointer to the entry, unless the agent has evidence that is newer than the entry. To get a candidate proposed again, delete its entry.

Adamantite never writes the record and never reads its entries. It reads whether the record exists and which commit last changed it:

- The prompt has a "Decisions" section that names the record and that commit.
- The agent now reads the fix commits since the commit that last changed the record. Without a record, or when git names no such commit, it reads the last 200 commits as before. `--commits <n>` reads the last `n` commits in both cases.
- `harden --json` has `decisionsRecord`, with the `_tag` `Committed`, `Uncommitted`, or `Missing`, and `fixHistory`, which is `{ "_tag": "Last", "count": 200 }` or `{ "_tag": "Since", "commit": "<hash>" }`.
- The record is not in the documentation list and not in the agent reach, so no `AGENTS.md` needs to link to it.

The Adamantite skill tells agents to read and write the record.
