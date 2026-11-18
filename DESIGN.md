---
version: alpha
name: Adamantite terminal
description: The current command-line presentation and interaction system.
omitted:
  - section: colors
    reason: Each status uses a named ANSI color, and the terminal theme supplies the color value.
  - section: typography
    reason: The terminal supplies the text font and size.
  - section: spacing
    reason: Output uses lines and two-space indents rather than a dimensional scale.
  - section: rounded
    reason: The interface has no application-defined corner radius.
components:
  status:
    info: { symbol: "●", color: blue }
    success: { symbol: "✔", color: green }
    warning: { symbol: "▲", color: yellow }
    error: { symbol: "✖", color: red }
    cancel: { symbol: "■", color: red }
  heading:
    style: bold
  finding:
    currentState: Current state
    goal: Goal
    reference: Reference
    notes: Notes
  resolutionMenu:
    copy: Copy the agent prompt
    done: Finish without an agent
---

# Terminal design

## Overview

Adamantite presents a sequence of command steps, status lines, and questions in the terminal.
[Output](src/terminal/output.ts) renders the lines through Effect's `Console`, and the questions
are the prompts of `effect/cli/Prompt`. Both use one style: a symbol at the start of the line, and
no guide line at the left edge. Plain Markdown reports carry findings and hardening instructions
when the command runs without interaction, and `--json` prints one JSON document for an agent.

This reference records the existing interface. The [architecture](docs/architecture.md) explains
command behavior, and [GLOSSARY.md](GLOSSARY.md) defines the terms used in the output.

## Colors

`Output` exposes the statuses `info`, `success`, `warning`, `error`, and `cancel`. Each status has
a symbol and a named ANSI color, which the `components.status` tokens list. Headings and finding
titles are bold. Colors appear only when Effect's `TerminalCapabilities.canColor` is true, so a
pipe, `NO_COLOR`, or `TERM=dumb` gets plain text.

Messages state the outcome in words, and the symbol marks the status, so a color is never the
only explanation of a result. An intro heading starts with `💠`. An outro heading starts with `✅`
when the command finished, and with `⚠️` when issues remain.

## Typography

The terminal controls the text font and size. The optional wordmark spells `adamantite` with
Figlet's `Roman` font at build time. [printTitle](src/terminal/title.ts) displays it only when
the terminal width is known and the complete wordmark fits.

Markdown reports use a document heading, numbered finding headings, bullets for goals, and code
fences for reference content. Paths, package names, and commands retain their literal spelling.

## Layout

Output follows a vertical sequence. Interactive lifecycle commands start with an intro heading,
show status lines and findings, ask the next question when needed, and finish with an outro
heading. Only a run in the `Menu` mode prints the headings. Each command owns its exact sequence
and messages.

A step prints one line when it finishes, such as `✔ Dependencies installed.` No spinner or
progress line runs while a step works. A step that fails ends the command with a tagged error, and
the runtime boundary prints that error once, as an `✖` line on standard error. A command that fails
for several reasons, such as `check` with a stage that did not start and an outdated setup, prints
one line for each, in order, and the first decides the exit code. A tool that failed after it
printed its report adds no line, and its exit code stands. Every other line
goes to standard output, so the lines and the prompts keep their order. With `--json`, standard
output holds only the JSON document, and every other line goes to standard error.

A status message that spans several lines indents each continuation line by two spaces, under the
text after the symbol. [Findings](src/terminal/resolution.ts) appear as numbered notes: a blank line,
the bold title, and the body indented by two spaces. The body contains `Current state` and `Goal`,
followed by `Reference` and `Notes` when present. Blank lines separate those sections, and each
goal or note has its own bullet.

Plain output, such as a Markdown report, a syntax tree, or a list of rule names, goes through
`Console.log` without a symbol. Effect's `TerminalCapabilities.canPrompt` treats a session as
interactive only when both standard input and standard output are terminals. A command decides its
[mode](src/terminal/mode.ts) once: `Json` with `--json`, `Menu` in an interactive session, and
`Plain` otherwise. `init --non-interactive` selects `Plain` in an interactive session too.

`init` and `update` print one status line for each step of the setup, in this order. Before them,
`init` prints the link of each Zed extension that the setup needs.

1. `Packages installed:`, with one line for each package and the version that it had, such as
   `oxlint: not installed → 1.93.0`.
2. One line for each managed script: `` `check` script added: `adamantite check`. ``, a
   `replaced` line with the command that it ran and the new command, or `` `check` script is up to
   date. ``
3. One line for each managed file: `created.`, `replaced with the current version.`, `is up to
   date.`, `kept, because it has changes that Adamantite did not write.`, or `deleted, because the
   setup no longer includes it.` Each line starts with the path, and a kept file names
   `adamantite doctor`.
4. One line for the lockfile: `written. Commit it with the setup.`, `updated. Commit it.`, or
   `already records this setup.`

A change prints as a `success` line, and a file or script that stays as it is prints as an `info`
line. [Setup lines](src/terminal/setup.ts) define the messages.

## Components

| Component       | Current presentation                                                                                                                       | Source                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Intro and outro | A bold heading names the command at the start. A bold heading states the outcome at the end.                                               | [Output](src/terminal/output.ts)                   |
| Status line     | A symbol and a message for each status: info, success, warning, error, or cancel.                                                          | [Output](src/terminal/output.ts)                   |
| Choice          | Effect's `Prompt.Confirm`, `Prompt.Select`, and `Prompt.MultiSelect`. A question shows `? message ›`, and its answer `✔ message … answer`. | `effect/cli/Prompt`                                |
| Cancel          | Ctrl-C or Esc at a prompt fails it with `QuitError`. The command prints a cancel line, such as `■ Setup was cancelled.`, and exits 1.      | The command                                        |
| Finding         | A numbered note with the current state, goals, and optional repair reference and notes.                                                    | [Findings](src/terminal/resolution.ts)             |
| Setup line      | A status line for each package install, managed script, managed file, and the lockfile that `init` and `update` handled.                   | [Setup lines](src/terminal/setup.ts)               |
| Resolution menu | Installed agent handoffs, then prompt copy, then `Finish without an agent`.                                                                | [Resolution menu](src/terminal/resolution-menu.ts) |
| Prompt copy     | Print the Markdown prompt and send it to the terminal clipboard with OSC 52. An agent CLI that does not start prints it too.               | [Resolution menu](src/terminal/resolution-menu.ts) |
| JSON document   | One JSON document with two-space indentation on standard output, which a command's Effect Schema decodes.                                  | [Output](src/terminal/output.ts)                   |

`Prompt.MultiSelect` shows `Select All` and `Inverse Selection` rows above its choices. Effect
offers no option to hide them.

[`Resolution.offer`](src/terminal/resolution.ts) is the one way that `doctor`, `harden`, `init`,
and `update` hand a prompt to an agent. It prints the JSON document with `--json`, shows the
findings and the resolution menu in a terminal, and prints the Markdown prompt otherwise. After an
agent session, it shows what remains, and offers to copy the repair prompt when findings remain.
A healthy non-interactive Doctor run is silent unless warnings remain. The
[warning report](src/lib/assessment/warning-report.md) and
[repair prompt](src/lib/assessment/repair-prompt.md) define the report headings and context.

## Do's and Don'ts

- Use the status that matches the outcome, and include the outcome in the message text.
- Print a step's outcome after the step finishes. Do not add a spinner or a start line for a step.
- Ask with `effect/cli/Prompt` from a command or the terminal folder. Lib code returns data, and
  `adamantite/import-owners` rejects a prompt import anywhere else.
- Set `initial` on every `Prompt.Confirm`. Effect defaults it to `false`.
- Keep the current state separate from the repair goal when presenting a finding.
- Keep the prompt-copy and decline choices available after the installed agent choices.
- Preserve readable Markdown output for non-interactive findings and hardening prompts.
- Keep the optional wordmark within the terminal width. Do not add an application font or
  fixed color values to this reference without a corresponding interface change.
- Do not draw a guide line at the left edge. Effect's prompts do not draw one, and the output
  matches them.
