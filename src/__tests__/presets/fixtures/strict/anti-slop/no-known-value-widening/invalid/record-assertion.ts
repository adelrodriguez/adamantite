type Command = () => void
const startCommand: Command = () => {}
export const commands = { start: startCommand } as Record<string, Command>
