import * as p from "@clack/prompts"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

interface PrompterService {
  readonly cancel: (message: string) => Effect.Effect<void>
  readonly confirm: (options: p.ConfirmOptions) => Effect.Effect<boolean | symbol>
  readonly intro: (message: string) => Effect.Effect<void>
  readonly log: {
    readonly error: (message: string) => Effect.Effect<void>
    readonly info: (message: string) => Effect.Effect<void>
    readonly success: (message: string) => Effect.Effect<void>
    readonly warning: (message: string) => Effect.Effect<void>
  }
  readonly multiselect: <T>(options: p.MultiSelectOptions<T>) => Effect.Effect<T[] | symbol>
  readonly outro: (message: string) => Effect.Effect<void>
  readonly spinner: () => p.SpinnerResult
}

export class Prompter extends Context.Tag("Prompter")<Prompter, PrompterService>() {}

export const PrompterLive = Layer.succeed(Prompter, {
  cancel: (message) =>
    Effect.sync(() => {
      p.cancel(message)
    }),
  confirm: (options) => Effect.tryPromise(() => p.confirm(options)).pipe(Effect.orDie),
  intro: (message) =>
    Effect.sync(() => {
      p.intro(message)
    }),
  log: {
    error: (message) =>
      Effect.sync(() => {
        p.log.error(message)
      }),
    info: (message) =>
      Effect.sync(() => {
        p.log.info(message)
      }),
    success: (message) =>
      Effect.sync(() => {
        p.log.success(message)
      }),
    warning: (message) =>
      Effect.sync(() => {
        p.log.warning(message)
      }),
  },
  multiselect: <T>(options: p.MultiSelectOptions<T>) =>
    Effect.tryPromise(() => p.multiselect(options)).pipe(Effect.orDie),
  outro: (message) =>
    Effect.sync(() => {
      p.outro(message)
    }),
  spinner: () => p.spinner(),
})
