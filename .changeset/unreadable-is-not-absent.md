---
"adamantite": patch
---

Report a file that Adamantite cannot read instead of treating it as missing

Some reads treated a permission error like a missing file. An unreadable `oxlint.config.ts` in a workspace package made `adamantite doctor` use another config and suggest the wrong repair. An unreadable `pnpm-workspace.yaml` made `adamantite analyze` skip Sherif. These commands now stop and name the file that they cannot read. A missing file, and a folder in place of a file, are still treated as absent.
