---
"adamantite": patch
---

Report an Oxlint config that fails to load in Doctor

Doctor now runs Oxlint to load the lint configs of the project. When a config fails to load, such as one that imports a preset that the installed Adamantite does not export, Doctor reports the `oxlint-config-load-failure` finding with the error that Oxlint printed, and exits with code 1. Before, Doctor only warned that it could not list the Oxlint files, and `adamantite check` failed without a finding. The finding and the adamantite skill point to the changelog for the preset that replaces a removed one.
