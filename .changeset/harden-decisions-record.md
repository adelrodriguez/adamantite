---
"adamantite": minor
---

Give `adamantite harden` a decisions record, so a later session does not propose again what you rejected

After you answer a harden session, the coding agent appends lines to `.adamantite/decisions.jsonl`. The record is at the project root, which is the workspace root in a monorepo. It is a JSON Lines log, and Adamantite never writes it. Commit the record.

```jsonl
{"session":"2026-03-14","head":"4f0c1d2e3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d"}
{"id":"tests-beside-module","at":"2026-03-14","standard":"Test files sit beside the module that they test","decision":"rejected","reason":"Integration tests stay in tests/","follow":41,"break":7,"fixes":["1a2b3c4"]}
```

A decision line records a candidate that you did not approve, or a decision that you made. It has the required keys `id`, `at`, `standard`, and `decision`, and the optional keys `reason`, `rule`, `scope`, `follow`, `break`, and `fixes`. The `decision` is `rejected`, `deferred`, `decided`, or `approved`. A decision is its `id` together with its `scope`, so one standard can have a decision for the project and another for a folder. A later line with the same `id` and the same `scope` replaces the earlier one, and an `approved` line ends that decision. An approved candidate gets no line, because its rule or instruction is the trace.

A session line records one session that you answered. It has `session`, the date, `head`, the commit that `HEAD` named, and `scope`, the `--path` of the session. The prompt gives the agent the line to copy. A session with `--commits` records no `head`, so it does not move the start of later sessions. The README describes each key.

Adamantite decodes the record:

- The prompt has a "Decisions" section that shows the last decision of each `id` and `scope` on one line. The agent lists a candidate that matches a decision under "Also considered", unless it has evidence that is newer than the decision. To let harden propose a candidate again, delete its decision line.
- With `--path`, the prompt leaves out the decisions of other folders.
- The prompt lists each line that does not decode, with its line number, for the agent to repair. After a handoff, `harden` exits 1 when the session added such a line.
- The agent now reads the fix commits after the common ancestor of `HEAD` and the commit of the last session line that covers the scope of the session. A line covers a scope when it has no `scope`, or when its `scope` is that folder or a parent of it. Without such a line, or when the repository does not have the recorded commit, the agent reads the last 200 commits as before. `--commits <n>` reads the last `n` commits in each case.
- `harden --json` has `decisionsRecord`, with the `_tag` `Present` or `Missing`. A present record has its `decisions`, its `sessions`, and its `undecodableLines`. `harden --json` also has `head`, the commit that `HEAD` names, and `fixHistory`. It is `{ "_tag": "Last", "count": 200 }` for the default, `{ "_tag": "Requested", "count": 30 }` for `--commits 30`, or `{ "_tag": "Since", "boundary": "<hash>", "head": "<hash>", "session": "<date>" }`.

The Adamantite skill tells agents to append to the record.
