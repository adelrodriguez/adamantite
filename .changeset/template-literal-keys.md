---
"adamantite": minor
---

Read template literal keys in the adamantite and anti-slop-effect rules

The rules that find calls of imported functions, such as `adamantite/no-react-state-hooks`, now report ``React[`useState`](0)``. The `anti-slop-effect` tag rules now report ``value[`_tag`] === "Ready"`` and ``{ [`_tag`]: "Ready" }``. All three plugins now read property keys with one shared helper, so a key form that one plugin reads, the others read too.
