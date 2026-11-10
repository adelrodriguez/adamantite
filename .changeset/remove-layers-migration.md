---
"adamantite": patch
---

Remove the Doctor finding for array-valued `adamantite/layers` declarations

No release accepted a layer as an array, such as `workspace: ["shared"]`, so the finding and its migration instructions could not apply to a working config. Doctor no longer parses the Oxlint config files to look for them. The README and the Adamantite skill no longer mention the migration.
