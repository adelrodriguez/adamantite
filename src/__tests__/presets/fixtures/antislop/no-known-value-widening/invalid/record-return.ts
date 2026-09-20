type Command = () => void
const startCommand: Command = () => {}
export function create(): Record<string, Command> {
  return { start: startCommand }
}
