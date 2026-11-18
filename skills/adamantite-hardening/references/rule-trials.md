# How to try a rule setting

Before changing a rule setting, run `adamantite rule try <rule> --report <case> --accept <case>`
when the task requires evidence from cases. Use `--options '<json array>'` for options after
the severity, or `--current` for the setting in the config. A case is a project path, or
`<path>=<file>` to lint the content of `<file>` at `<path>` in a copy of the project. Add `--json`
to read the reports of each case as JSON.

Continue when every case gives the expected result. Exit code 1 means a case differs.
Exit code 2 means the trial could not supply evidence, such as when the rule does not exist.

## Check the trial

- Each case is a project path, or a file outside the project that the trial lints at a project path.
- The trial exited 0, or the report says which case differed or why the trial gave no evidence.
- No case file remains in the project.
