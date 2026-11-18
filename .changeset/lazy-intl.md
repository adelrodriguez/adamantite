---
"adamantite": patch
---

Start each command without loading ICU's data

`adamantite check`, `fix`, and the other commands no longer create an `Intl` object at startup. The first `Intl` object loads ICU's data, which slowed every command. The bundled Effect now creates its grapheme segmenter when the CLI first measures text, such as for `--help`.
