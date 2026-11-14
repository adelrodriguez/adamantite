export default async function Page() {
  const todos = await Promise.resolve([{ id: "first", text: "Read" }])

  return (
    <main>
      <h1>Todos</h1>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </main>
  )
}
