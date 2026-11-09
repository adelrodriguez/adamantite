---
"adamantite": patch
---

Stop concurrent lint runs from loading an empty or foreign custom rules module

`custom()` wrote its entry module in place, so an Oxlint process that loaded the module during another process's write could read an empty file and fail to load the custom rules. This happens when a monorepo task runner lints several packages at once. Two installed Adamantite copies that load the same rules folder also wrote the same file, so a run could load the rules through the other copy. `custom()` now writes the module to a temporary file and renames it into place, and each Adamantite copy gets its own module file.
