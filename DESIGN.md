---
version: alpha
name: Adamantite terminal
description: The current command-line presentation and interaction system.
omitted:
  - section: colors
    reason: Clack and the terminal theme supply the colors.
  - section: typography
    reason: The terminal supplies the text font and size.
  - section: spacing
    reason: Output uses lines and Clack layout rather than a dimensional scale.
  - section: rounded
    reason: The interface has no application-defined corner radius.
components:
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

Adamantite presents a sequence of command steps, status messages, and choices in the terminal.
Interactive output uses [Clack through Prompter](src/terminal/prompter.ts). Plain Markdown
reports carry findings and hardening instructions when the command runs without interaction.

This reference records the existing interface. The [architecture](docs/architecture.md) explains
command behavior, and [GLOSSARY.md](GLOSSARY.md) defines the terms used in the output.

## Colors

`Prompter.log` exposes the semantic levels `info`, `success`, `warning`, and `error`. Clack renders
those levels with its default styles. Adamantite defines no separate color palette.

Messages state the outcome in words. Existing command messages pair symbols such as `💠`, `✅`,
`⚠️`, and `❌` with text, so a symbol or color is not the only explanation of the result.

## Typography

The terminal controls the text font and size. The optional wordmark spells `adamantite` with
Figlet's `Roman` font at build time. [printTitle](src/terminal/title.ts) displays it only when
the terminal width is known and the complete wordmark fits.

Markdown reports use a document heading, numbered finding headings, bullets for goals, and code
fences for reference content. Paths, package names, and commands retain their literal spelling.

## Layout

Output follows a vertical sequence. Interactive lifecycle commands start with an intro, show
progress and findings, offer the next action when needed, and finish with an outcome. Each
command owns its exact sequence and messages.

[Findings](src/terminal/findings.ts) appear as numbered Clack notes. Each note contains `Current
state` and `Goal`, followed by `Reference` and `Notes` when present. Blank lines separate those
sections, and each goal or note has its own bullet.

Plain prompt output uses `Prompter.message`, which removes Clack's guide and extra spacing.
[TerminalCapabilities](src/terminal/capabilities.ts) treats a session as interactive only when
both standard input and standard output are terminals. A command can also expose its own
non-interactive option.

## Components

| Component       | Current presentation                                                                                                           | Source                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Intro and outro | A command label introduces the session. The final message states its outcome.                                                  | [Prompter](src/terminal/prompter.ts)                  |
| Status log      | An information, success, warning, or error message.                                                                            | [Prompter](src/terminal/prompter.ts)                  |
| Progress        | A spinner has a start message, optional progress messages, and a success or failure message. It stops when the operation ends. | [Prompter](src/terminal/prompter.ts)                  |
| Choice          | Clack select, multiselect, or confirm controls.                                                                                | [Prompter](src/terminal/prompter.ts)                  |
| Finding         | A numbered note with the current state, goals, and optional repair reference and notes.                                        | [Findings](src/terminal/findings.ts)                  |
| Resolution menu | Installed agent handoffs, then prompt copy, then `Finish without an agent`.                                                    | [Resolution menu](src/terminal/resolution-menu.ts)    |
| Prompt copy     | Print the Markdown prompt and send it to the terminal clipboard with OSC 52.                                                   | [Terminal capabilities](src/terminal/capabilities.ts) |

Doctor prints findings as Markdown when it cannot offer an interactive resolution menu. Its
healthy non-interactive path is silent unless warnings remain. The
[warning report](src/lib/assessment/warning-report.md) and
[repair prompt](src/lib/assessment/repair-prompt.md) define the report headings and context.

## Do's and Don'ts

- Use the existing semantic log level and include the outcome in the message text.
- Keep progress messages tied to an operation, and stop the spinner on success or failure.
- Keep the current state separate from the repair goal when presenting a finding.
- Keep the prompt-copy and decline choices available after the installed agent choices.
- Preserve readable Markdown output for non-interactive findings and hardening prompts.
- Keep the optional wordmark within the terminal width. Do not add an application font or
  fixed color values to this reference without a corresponding interface change.
