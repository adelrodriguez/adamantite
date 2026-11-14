---
"adamantite": patch
---

Report a named dictionary once in `antislop/no-unsafe-dictionary-type`, also when a type alias uses it

The rule reported a named dictionary such as `type LogFields = Record<string, unknown>` again at each use inside another type alias. So `type Logger = { info: (event: LogFields) => void }` got one report for each method, and the same members in an interface got none. Now a use inside a type alias reports only at the declaration, as a use in an interface or a variable does. An alias whose whole body is the dictionary, such as `type Other = LogFields`, still reports, because it gives the dictionary another name.

A logger or tracer that accepts open fields can name its field bag once and suppress the rule at that declaration with a reason. The strict preset section of the README shows how.
