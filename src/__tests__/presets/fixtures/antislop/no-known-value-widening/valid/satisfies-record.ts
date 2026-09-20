type Command = () => void
const startCommand: Command = () => {}
export const commands = { start: startCommand } satisfies Record<string, Command>
