import * as p from "@clack/prompts"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
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
  readonly select: <T>(options: p.SelectOptions<T>) => Effect.Effect<T, OperationCancelled>
  readonly withSpinner: <A, E, R>(
    run: (spinner: {
      readonly message: (message: string) => Effect.Effect<void>
    }) => Effect.Effect<A, E, R>,
    options: {
      readonly failure?: string
      readonly start: string
      readonly success: string | ((value: A) => string | undefined)
    }
  ) => Effect.Effect<A, E, R>
}

export class Prompter extends Context.Service<Prompter, PrompterService>()("Prompter") {
  static layerWithSpinner(spinnerFactory: typeof p.spinner) {
    return Layer.succeed(this)({
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
      select: <T>(options: p.SelectOptions<T>) =>
        Effect.promise(() => p.select(options)).pipe(
          Effect.filterOrFail(
            (value): value is T => !p.isCancel(value),
            () => new OperationCancelled({})
          )
        ),
      withSpinner: (run, options) =>
        Effect.acquireUseRelease(
          Effect.sync(() => {
            const spinner = spinnerFactory()
            spinner.start(options.start)
            return spinner
          }),
          (spinner) =>
            run({
              message: (message) =>
                Effect.sync(() => {
                  spinner.message(message)
                }),
            }),
          (spinner, exit) =>
            Effect.sync(() => {
              spinner.stop(
                Exit.match(exit, {
                  onFailure: () => options.failure,
                  onSuccess: (value) =>
                    Predicate.isFunction(options.success)
                      ? options.success(value)
                      : options.success,
                })
              )
            })
        ),
    })
  }

  static readonly layer = this.layerWithSpinner(p.spinner)
}
