---
"adamantite": patch
---

Say that the trial could not copy the project, instead of naming a file that does not exist

When `adamantite rule try` or `adamantite harden` could not copy the project to a temporary folder, the error said ``Could not write `the copy of the project`.`` and hid where the copy failed. The error now says that the trial could not copy the project, and names the cause, such as a full disk.
