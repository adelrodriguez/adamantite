import type * as Effect from "effect/Effect"
import type { Integration } from "#lib/integrations/base.ts"
import agents from "#lib/integrations/agents/index.ts"
import github from "#lib/integrations/github/index.ts"
import knip from "#lib/integrations/knip/index.ts"
import oxfmt from "#lib/integrations/oxfmt/index.ts"
import oxlint from "#lib/integrations/oxlint/index.ts"
import sherif from "#lib/integrations/sherif/index.ts"
import typescript from "#lib/integrations/typescript/index.ts"
import vscode from "#lib/integrations/vscode/index.ts"
import zed from "#lib/integrations/zed/index.ts"

const list = [
  oxlint,
  oxfmt,
  knip,
  sherif,
  typescript,
  vscode,
  zed,
  github,
  agents,
] as const satisfies readonly Integration[]

type Member = (typeof list)[number]

// The effects of every member, so a caller that iterates the list keeps their errors and services.
type MemberEffect = ReturnType<Member["assess" | "files" | "prepare"]>

/**
 * The integrations that own a folder in `src/lib/integrations/`. `Setup.apply` writes their managed
 * files and installs their packages, and the assessment runs each one that the selection includes.
 * The integrations that have not moved here yet keep their own setup steps in `init`.
 */
export const integrations: ReadonlyArray<
  Integration<Effect.Error<MemberEffect>, Effect.Services<MemberEffect>>
> = list
