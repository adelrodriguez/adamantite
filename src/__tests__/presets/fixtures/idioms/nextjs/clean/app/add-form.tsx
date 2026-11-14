"use client"

import { useActionState } from "react"

import { createTodoState } from "./state-action.js"

export function AddForm() {
  const [state, formAction] = useActionState(createTodoState, { message: "" })

  return (
    <form action={formAction}>
      <label htmlFor="todo">Todo</label>
      <input id="todo" name="todo" required />
      <button type="submit">Add</button>
      <output>{state.message}</output>
    </form>
  )
}
