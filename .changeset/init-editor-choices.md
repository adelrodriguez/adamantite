---
"adamantite": patch
---

Name the `.vscode/settings.json` editor choice "Universal" in `adamantite init`

VS Code, Cursor, Windsurf, and other editors read `.vscode/settings.json`, so the `init` prompt now calls that choice "Universal". The highlighted editor choice also shows the settings file that `init` creates. The `--editor vscode` flag does not change.
