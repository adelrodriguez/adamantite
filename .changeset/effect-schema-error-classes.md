---
"adamantite": patch
---

Accept an error class that `Schema.TaggedError` or `Schema.Error` makes in the effect preset

The effect lint preset now turns off the core rule `unicorn/throw-new-error`. The rule reported `class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { ... }) {}` as an error made without `new`, and its fix added a `new` that broke the class. The rule stays off in the preset until Oxlint fixes [oxc-project/oxc#27718](https://github.com/oxc-project/oxc/issues/27718).
