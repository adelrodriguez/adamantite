# The first-party plugins use the antislop namespaces

The strict and effect presets use `antislop/*` and `antislop-effect/*` rule IDs. The plugin names and folders use the same spelling. This replaces the namespace decisions in ADR 0025 and ADR 0027.

Doctor reports each old rule key in the root config, package configs, and local modules that those configs import. It also reports old rule IDs in suppression comments of the files that Oxlint lints. Each entry includes its location and replacement. The agent or the user makes the change, and a later Doctor run confirms it, as ADR 0002 requires. Update reports the remaining Doctor findings too.

The namespace table stays beside the retired presets so a later release can remove this migration. Registering both names would leave old settings in use without a report. A changelog note alone would give no direct help when a suppression stops working. Upstream links, license notices, and historical records retain their original spelling.
