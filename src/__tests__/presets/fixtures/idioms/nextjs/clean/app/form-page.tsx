import { createTodo } from "./actions.js"
import revalidate from "./revalidate.js"

export default function FormPage() {
  return (
    <main>
      <form action={createTodo}>
        <label htmlFor="todo">Todo</label>
        <input id="todo" name="todo" required />
        <button type="submit">Add</button>
      </form>
      <form action={revalidate}>
        <button type="submit">Refresh</button>
      </form>
    </main>
  )
}
