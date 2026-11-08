# Layer maps nest with explicit imports

Layer maps must remain readable when agents write the configuration. We decided
(2026-11-07, issue #644) that each layer has an explicit `imports` list and can contain a
child map in `layers`. Named dependencies preserve selective branches, and sorting the
declarations does not change permissions. This replaces the declaration shape and the
rejection of nesting in ADR 0013. We rejected ordered sibling groups because they cannot
express every supported graph and moving a group changes permissions through position.

A node's `imports` belong to its parent map. Its `layers` and adjacent settings belong to
its child map. Settings do not inherit. Physical containment activates child maps before
parent ignores, entries, or graph errors, so every containing map remains an independent
constraint. A child root uses the actual matched parent folder, not concatenated glob text.
One concrete scope has one declaration. Distinct roots can remain separate when nesting
would require a new intermediate scope.

Oxlint validates the recursive option schema and fails on old or malformed declarations.
Doctor detects old declarations in the source modules that config discovery reads and
gives migration instructions. Doctor does not write files. The migration preserves all
dependencies, scopes, and map-local settings before the separate child option is removed.
