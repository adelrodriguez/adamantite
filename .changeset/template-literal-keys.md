---
"adamantite": minor
---

Read template literal keys in the adamantite and antislop-effect rules

The rules that find calls of imported functions, such as `adamantite/no-react-state-hooks`, now report ``React[`useState`](0)``. The `antislop-effect` tag rules now report ``value[`_tag`] === "Ready"`` and ``{ [`_tag`]: "Ready" }``, classify ``error[`reason`][`_tag`]`` as a reason tag, and accept the pattern object of ``Match[`when`](...)``. `adamantite/no-query-data-in-state` reads ``query[`data`]`` and `{ ["data"]: user }`. In `antislop/no-unknown-parameters`, a parser, promise, or `cause` name written as a string or template key, such as `schema["parse"](value)`, gets the same exemption as the plain name. All three plugins now read property keys with one shared helper, so a key form that one plugin reads, the others read too.
