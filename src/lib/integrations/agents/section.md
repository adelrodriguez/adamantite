{{start}}

## Adamantite

Use the Adamantite skill for managed setup, Doctor repairs, and hardening. If the skill is not installed, read `skills/adamantite/SKILL.md` in the installed `adamantite` package.

{{scripts}}{{customRules}}- Run `adamantite doctor --json` for managed setup findings. Repair each finding and rerun Doctor to verify the result.

- After you fix a regression or a mistake that a reviewer corrected before, or before you add a disable comment, follow the "{{correctionsSection}}" section of the Adamantite skill.

### Check the result

- Read the output of the affected checks. Report failures or unavailable checks.
- Report unresolved Doctor findings and assessment warnings separately.

{{end}}
