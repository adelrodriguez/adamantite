type Command = () => void
const startCommand: Command = () => {}
type Open = Record<string, Command>
const source = { start: startCommand }
export const commands: Open = source
