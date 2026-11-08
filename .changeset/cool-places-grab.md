---
"adamantite": minor
---

Load the managed React Doctor plugin through `react-strict`

`react-strict` now checks effect cleanup, stale timers, discarded cleanup callbacks, loading
flags left set after failed requests, and contexts or object URLs created during render.
The general cleanup rule also covers observer cleanup and mismatched subscription callbacks.
The upstream rule names stay under `react-doctor/*`.

Init installs the pinned `oxlint-plugin-react-doctor` package when you select `react-strict`.
Doctor and update maintain the package for that preset.

The separate `adamantite/lint/react-doctor` preset is removed. Run `adamantite doctor` for
its migration finding and repair prompt. The repair preserves project settings and rule
overrides and keeps one `react-strict` entry when both presets were present.
