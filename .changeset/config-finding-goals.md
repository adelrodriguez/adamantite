---
"adamantite": patch
---

Give each invalid config finding the repair for its reason

Doctor reported the same goal for every invalid `oxlint.config.ts`: set the three type-aware options to `true`. When the config exported a variable, or did not parse, that goal did not fix the finding. Each reason now has its own goal. Doctor asks to export the config object literal directly, or to fix the syntax errors. For an invalid Oxfmt or Knip config that does not parse, Doctor asks to fix the syntax errors in place of adding the preset.
