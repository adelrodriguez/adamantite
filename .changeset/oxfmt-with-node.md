---
"adamantite": patch
---

Start the project's Oxfmt with `node` in `adamantite check` and `fix`, so formatting starts sooner

`check` and `fix` no longer go through the shell script in `node_modules/.bin`. They start the CLI module of the Oxfmt that the project installs. When Oxfmt is missing, the error now says that the project does not install `oxfmt`, instead of that `PATH` has no `oxfmt`. An `oxfmt` on `PATH` that the project does not install no longer runs.
