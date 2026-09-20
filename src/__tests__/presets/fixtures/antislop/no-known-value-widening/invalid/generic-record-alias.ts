type Command = () => void
const startCommand: Command = () => {}
type Index<T> = Record<string, T>
export const commands: Index<Command> = { start: startCommand }
