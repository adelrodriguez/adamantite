import * as p from "@clack/prompts"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"
import { OperationCancelled } from "#lib/shared/errors.ts"

interface PrompterService {
  readonly cancel: (message: string) => Effect.Effect<void>
  readonly confirm: (options: p.ConfirmOptions) => Effect.Effect<boolean, OperationCancelled>
  readonly intro: (message: string) => Effect.Effect<void>
  readonly log: {
    readonly error: (message: string) => Effect.Effect<void>
    readonly info: (message: string) => Effect.Effect<void>
    readonly success: (message: string) => Effect.Effect<void>
    readonly warning: (message: string) => Effect.Effect<void>
  }
  readonly multiselect: <T>(
    options: p.MultiSelectOptions<T>
  ) => Effect.Effect<T[], OperationCancelled>
  readonly outro: (message: string) => Effect.Effect<void>
  readonly spinner: () => p.SpinnerResult
}

export class Prompter extends ServiceMap.Service<Prompter, PrompterService>()("Prompter") {
  static readonly layer = Layer.succeed(this)({
    cancel: (message) =>
      Effect.sync(() => {
        p.cancel(message)
      }),
    confirm: (options) =>
      Effect.promise(() => p.confirm(options)).pipe(
        Effect.filterOrFail(
          (value): value is boolean => !p.isCancel(value),
          () => new OperationCancelled({})
        )
      ),
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
      Effect.promise(() => p.multiselect(options)).pipe(
        Effect.filterOrFail(
          (value): value is T[] => !p.isCancel(value),
          () => new OperationCancelled({})
        )
      ),
    outro: (message) =>
      Effect.sync(() => {
        p.outro(message)
      }),
    spinner: () => p.spinner(),
  })
}
