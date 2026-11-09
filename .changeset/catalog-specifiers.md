---
"adamantite": patch
---

Read pnpm `catalog:` versions instead of reporting the package as outdated

`adamantite doctor` compared each managed package's specifier in `package.json` as text, so `"oxlint": "catalog:"` always read as outdated, and Doctor failed on a correct setup. `adamantite update` then ran `pnpm add oxlint@<version>`, which replaced `catalog:` with a pinned version and left the catalog out of sync with the other packages.

Doctor now reads the version from the `catalog` or `catalogs` of `pnpm-workspace.yaml`. An outdated catalog entry gets a finding that tells you to change the catalog, and `update` leaves it alone. A specifier whose version Adamantite cannot read, such as `npm:`, `link:`, or a range like `>=1.0.0`, gets a warning instead of an "Outdated" finding.
