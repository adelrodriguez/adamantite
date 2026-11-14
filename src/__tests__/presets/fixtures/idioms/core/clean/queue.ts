export class TaskQueue {
  #pending = 0
  readonly #listeners = new Map<string, Set<() => void>>()

  add() {
    this.#pending += 1

    return this.#pending
  }

  on(event: string, listener: () => void) {
    const listeners = this.#listeners.get(event) ?? new Set()

    listeners.add(listener)
    this.#listeners.set(event, listeners)
  }
}
