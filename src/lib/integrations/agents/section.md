{{start}}

## Adamantite

Use the `adamantite` skill for managed setup, checks, and Doctor repairs, and the `{{hardeningSkill}}` skill for coding standards, custom rules, and hardening. If a skill is not installed, read its `SKILL.md` below `skills/` in the installed `adamantite` package.

{{scriptLines}}{{customRuleLines}}- Run `adamantite doctor --json` for managed setup findings. Repair each finding and rerun Doctor to verify the result.

- After you fix a regression or a mistake that a reviewer corrected before, or before you add a disable comment, follow the "{{correctionsSection}}" section of the `{{hardeningSkill}}` skill.

### Check the result

- Read the output of the affected checks. Report failures or unavailable checks.
- Report unresolved Doctor findings and assessment warnings separately.

{{end}}
