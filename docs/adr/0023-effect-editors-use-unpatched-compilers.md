# Effect editors use unpatched compilers

The Effect language server needs diagnostics enabled to offer semantic quick fixes. We decided
(2026-11-07, issue #632) to let it own Effect diagnostics in editors. The editor integrations hide
the corresponding Oxlint rule reports with `rulesCustomization`, using every Effect rule in the
installed package's schema. CLI Oxlint keeps the curated effect preset. This replaces the
`diagnostics: false` policy in ADR 0007. A CLI run with Oxlint's `typeCheck` option can also emit
the Effect compiler's diagnostics; that option is not part of the effect preset.

VS Code needs an SDK folder with a native executable. Init copies the compiler that matches the
installed TypeScript `gitHead`, with its standard libraries, into
`node_modules/.cache/adamantite/effect-sdk/`. The user selected a cache inside `node_modules` rather
than a folder in the project root. The shared setting has no host-specific path. A copy works on
Windows without symbolic-link permissions and leaves installed package files unchanged. We
accept preparing the cache after a fresh install or dependency update in exchange for keeping
the existing package structure and avoiding install scripts.

Zed accepts a command and arguments, so it starts the installed upstream CLI with
`tsc --lsp --stdio`. `@effect/tsgo` 0.67.3 is the first published release with the piped-input fix
from upstream PR #1006. Both editor integrations own their settings; one editor helper owns the
shared Effect facts and the SDK cache. Doctor only reads the settings and cache and reports
missing or stale state. Update still changes only managed dependencies and the Adamantite skill.
