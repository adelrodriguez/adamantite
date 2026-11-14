export function TodoList({ todos }: { todos: Array<{ id: string; text: string }> }) {
  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  )
}
