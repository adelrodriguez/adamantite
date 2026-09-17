---
"adamantite": minor
---

Include Oxfmt when init configures check or fix. Remove format from the init picker, generated CI workflows, and agent guidance. Init now rejects explicit format script requests and points to check and fix. Doctor now reports missing Oxfmt packages and configuration for target projects with managed check or fix scripts.

Breaking behavior: setup scripts that pass `--script format` must select `check` or `fix` instead. Oxfmt assessment now requires a managed `check` or `fix` script; a legacy `format` script alone no longer enables it. The standalone `adamantite format` command remains available during the transition tracked in #428.
