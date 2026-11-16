---
"adamantite": minor
---

Write the VS Code settings and extension recommendations whole, and remove `--install-extensions`

`adamantite init` and `adamantite update` now write `.vscode/settings.json` and a new `.vscode/extensions.json` only whole, and only when the file does not exist or still holds what Adamantite wrote, by its hash in `.adamantite/adamantite-lock.json`. They no longer merge Adamantite's settings into your settings, and they no longer stop or print a change to make by hand when the file has comments. A file that you changed is kept, and `adamantite doctor` reports a change that breaks the setup, such as a missing Oxlint entry or a missing extension recommendation. A file that an earlier version wrote and nobody changed is replaced with the current version.

`.vscode/extensions.json` recommends `oxc.oxc-vscode` for the `check` and `fix` scripts, `webpro.vscode-knip` for `analyze`, and `TypeScriptTeam.native-preview` for the `effect` preset, so VS Code offers to install them. It replaces the `--install-extensions` flag and its prompt, which ran `code --install-extension`. Remove `--install-extensions` from your `init` commands. Init now prints the Zed extension links whenever it sets up Zed.

`adamantite update` now also prepares the Effect editor SDK for VS Code, and the `vscode-effect-sdk` finding says to run `adamantite update`. A project without a matching Effect build gets that finding, and `init` continues instead of failing.
