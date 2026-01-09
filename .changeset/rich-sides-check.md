---
"adamantite": minor
---

Replace Tailwind CSS lint preset with experimental formatting options

The `adamantite/lint/tailwind` preset has been removed. Tailwind CSS class sorting is now handled via oxfmt's `experimentalTailwindcss` option, which is already enabled in the `adamantite` format preset.

If you were using the Tailwind lint preset, simply remove it from your configuration. Class sorting will be handled automatically when formatting with `adamantite format`.
