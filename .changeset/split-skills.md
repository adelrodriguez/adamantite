---
"adamantite": minor
---

Ship two skills: `adamantite` for the toolchain, and `adamantite-hardening` for coding standards

One skill covered setup, checks, Doctor, updates, hardening, custom rules, and the guide for a fixed mistake, so an agent loaded all of it for any of those tasks. The package now ships two skills, and `adamantite init --agents` writes both to each skill folder:

- `adamantite` covers setup, `check`, `fix`, `analyze`, Doctor findings, preset rule reports, and `update`.
- `adamantite-hardening` covers the guide for a fixed mistake and a disable comment, `adamantite harden`, the enforcement ladder, custom rules, rule trials, and layer maps and import owners.

To migrate, run `adamantite update` and commit the result. It writes `adamantite-hardening` to each skill folder, writes the new `adamantite` skill over each copy that is unchanged, and deletes the three guides that moved, `corrections.md`, `custom-rules.md`, and `enforcement-ladder.md`, where they are unchanged. For a copy that you changed, Doctor reports the `stale-adamantite-skill` finding, which now names the folder of the skill. It also reports a moved guide that you changed, because `update` keeps that file and the skill no longer links to it.

Three things changed with the split:

- The Adamantite section of a new `AGENTS.md` names both skills. In an `AGENTS.md` that you changed, replace "the Adamantite skill" with the skill that holds the section: `adamantite-hardening` for custom rules and for a fixed mistake.
- Doctor reports an `adamantite-hardening` entry in `skills-lock.json` with the `skills-lock-adamantite-entry` finding, as it does for an `adamantite` entry.
- The harden prompt and `adamantite rule add` send agents to `skills/adamantite-hardening/SKILL.md`.
