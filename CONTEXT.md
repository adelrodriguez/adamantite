# Adamantite

Adamantite is an opinionated preset package and CLI for modern TypeScript projects. It
applies and maintains code-quality tooling in a target project.

## Language

**Preset**:
Published configuration that a target project consumes for linting, formatting, analysis,
or TypeScript.
_Avoid_: Plugin, template

**Vendored bundle**:
Third-party code that Adamantite builds into the package at a pinned upstream commit
because upstream does not publish to npm, such as the anti-slop rules inside the
`antislop` preset.
_Avoid_: Plugin, dependency

**Target project**:
The project that Adamantite configures or checks.
_Avoid_: Adamantite repository, consumer repository

**Managed integration**:
An adapter for a tool, editor, workspace feature, or CI provider whose supported state
Adamantite can detect and maintain.
_Avoid_: Plugin, preset

**Tooling integration**:
A managed integration for a package and its configuration, such as Oxlint, Oxfmt, Knip,
Sherif, or Tsgolint.
_Avoid_: Dependency adapter

**Migration**:
A one-time transition for legacy state that falls outside the normal managed integration
lifecycle.
_Avoid_: Update, fix

**Managed script**:
A `package.json` script whose command is owned by Adamantite.
_Avoid_: User script, package command

**Assessment**:
A read-only classification of the current state of a managed integration and the action,
if any, needed to reach the latest supported state.
_Avoid_: Check result, diagnostic

**Manual fix**:
An assessment that Adamantite reports but does not apply because automatic mutation could
overwrite unsupported or custom project state.
_Avoid_: Automatic fix

## Integration lifecycle

**Detect**:
Inspect whether a managed integration is present and identify its supported or legacy
configuration state.
_Avoid_: Assess, create

**Create**:
Write the latest supported configuration when it is missing.
_Avoid_: Migrate, update

**Update**:
Rewrite an existing supported configuration into the latest supported shape.
_Avoid_: Migration, dependency update

**Assess**:
Classify package drift, missing configuration, supported configuration updates, manual
work, and known migrations without changing the target project.
_Avoid_: Doctor fix, migration

**Doctor**:
Report assessments for Adamantite-managed integrations.
_Avoid_: Check, update

**Doctor fix**:
Apply safe assessment actions through integration creation, integration updates, package
installation, and migrations. Manual fixes remain report-only.
_Avoid_: Update command, fix command
