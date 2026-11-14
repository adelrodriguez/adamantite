---
"adamantite": patch
---

Name the option that produced each `adamantite/import-owners` report

A report of `adamantite/import-owners` named the owners, but not the option that restricted the import. With many options, or with two options for the same module, you could not tell which option to change. Each report now names the option, such as `options[1]`, with the same convention as `adamantite/layers`. It also says whether the owner paths are relative to the workspace root or to the package root. The report does not print the path of the root, because that path is different on each machine.
