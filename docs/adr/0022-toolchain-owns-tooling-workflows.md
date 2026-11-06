# Toolchain coordinates tools and shares runtime resolution with Doctor

Check, fix, and analyze each selected tools and built their arguments in the command handler.
Harden repeated check's sequence. Doctor inspected package declarations and configuration,
but could accept a project whose installed native runtime could not start. We decided
(2026-11-05, issue #625) to give that shared behavior one owner.

## Responsibilities

Effect CLI keeps command composition, shared flags, parsing, and help. Commands call the
check, fix, and analyze operations through `src/lib/toolchain/index.ts`. Toolchain owns stage
selection, argument routing, run order, and failure policy. Each tool's integration builds
its own command. The existing CommandRunner starts child processes. Harden calls the same
check operation after a handoff.

Toolchain now means the configured code-quality tools and their plugins. The package,
native binding, and type-aware backend that ADR 0019 called a toolchain are the Oxlint
runtime. Its resolver lives in `tooling/oxlint/runtime.ts`, and its entry adapter lives
beside it in `entry.ts`. The published entry stays `dist/oxlint.js`.

## Plugin capabilities

Each host owns its plugin interface. Oxlint definitions declare a JavaScript capability
or a native resolver that returns binding and backend overrides. A native resolver returns
no overrides when the target project does not install its package. Two overrides for the same
part fail. A backend override replaces all default backend variables.

One macro-free registry supplies both runtime resolution and managed integrations.
`plugins/managed.ts` adds pinned versions and package assessment. Its exhaustive version
table prevents a definition without a pin. This separation lets the Oxlint entry keep
running directly from source without macro transforms.

JavaScript plugins still load through their presets. Installed native packages select runtime
overrides, as ADR 0019 requires for nested and relative preset imports. Root preset imports
still determine managed package requirements. These are separate decisions.

## Doctor

The Oxlint integration calls the same runtime resolver as the entry. It converts known
runtime failures into findings, while unexpected read and parse failures still propagate.
Package assessment reports undeclared dependencies. Runtime assessment reports declared
packages that are not installed and native parts that cannot resolve. Assessment reads files,
but it changes no files or process variables and starts no tools. Only the entry sets variables
and loads Oxlint.

## Alternatives and costs

- Keep workflows in the command handlers. This leaves harden with a second check sequence
  and spreads tool arguments across callers.
- Add a generic job engine. CommandRunner already runs ordered steps and supports both
  continuing after failures and stopping at the first failure. Explicit operations need
  less configuration and keep the different policies visible.
- Load the managed registry from the entry. Its version macros run at build time, and
  `node src/oxlint.ts` applies no build transform, so the source entry would run different
  code than `dist/oxlint.js`.

We accept an extra Toolchain layer and a separate managed-registry module in exchange for
one owner of execution policy and one definition of the installed runtime. Layer and
import-owner rules enforce that direction. Public commands, flags, warning policy, stage
order, and the stock-Oxlint fallback from ADR 0021 remain compatible.
