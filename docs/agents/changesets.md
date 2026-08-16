# Changesets

This repository uses Changesets for versioning and changelog management.

## Agent rules

- Add a changeset for CLI behavior, presets, package exports, runtime dependencies, and
  documentation shipped with the package.
- Do not add a changeset for tests, CI, contributor documentation, release tooling, or
  internal maintenance.
- Use `pnpm exec changeset` to create a changeset.
- Never make a major version bump unless the user requests it.
- If a change is breaking and the current package version is 1.0.0 or higher, alert the
  user.
