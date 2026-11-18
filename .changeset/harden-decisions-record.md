---
"adamantite": minor
---

Give `adamantite harden` a decisions record, so a later session does not propose again what you rejected

After you answer a harden session, the coding agent appends one line to `.adamantite/decisions.jsonl` for each candidate that you did not approve, and for each decision that you made. The record is at the project root, which is the workspace root in a monorepo. It is a JSON Lines log, and Adamantite never writes it. An approved candidate gets no line, because its rule or instruction is the trace. Commit the record.

```jsonl
{"id":"tests-beside-module","at":"2026-03-14","standard":"Test files sit beside the module that they test","decision":"rejected","reason":"Integration tests stay in tests/","follow":41,"break":7,"fixes":["1a2b3c4"]}
```

A line has the required keys `id`, `at`, `standard`, and `decision`, and the optional keys `reason`, `rule`, `scope`, `follow`, `break`, and `fixes`. The `decision` is `rejected`, `deferred`, `decided`, or `approved`. A later line with the same `id` replaces the earlier one, and an `approved` line ends the decision. The README describes each key.

Adamantite decodes the record:

- The prompt has a "Decisions" section that shows the last decision of each `id` on one line. The agent lists a candidate that matches a decision under "Also considered", unless it has evidence that is newer than the decision. To let harden propose a candidate again, delete its line.
- With `--path`, the prompt leaves out the decisions of other folders.
- The prompt lists each line that does not decode, with its line number, for the agent to repair. After a handoff, `harden` exits 1 when the session added such a line.
- The agent now reads the fix commits since the commit that last changed the record. Without a record, or when git names no such commit, it reads the last 200 commits as before. `--commits <n>` reads the last `n` commits in both cases.
- `harden --json` has `decisionsRecord`, with the `_tag` `Present` or `Missing`. A present record has its `decisions`, its `undecodableLines`, and its `lastChange`. `harden --json` also has `fixHistory`, which is `{ "_tag": "Last", "count": 200 }` or `{ "_tag": "Since", "commit": "<hash>" }`.

The Adamantite skill tells agents to append to the record.
