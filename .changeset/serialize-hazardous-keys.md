---
"adamantite": patch
---

Fix `serializeTsObjectLiteral` corrupting keys that contain a double quote and dropping own `__proto__` keys

The key-unquoting regex matched escaped quotes inside serialized keys, so migrating a knip or oxfmt config with a quote-containing key produced a `*.config.ts` file with invalid syntax. It also unquoted `__proto__`, which an object literal treats as prototype assignment, so the key vanished from the evaluated config. Quote-containing keys now stay quoted, and `__proto__` keys are emitted as computed properties (`["__proto__"]:`) so they survive as own properties.
