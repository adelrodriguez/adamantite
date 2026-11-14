type Command = () => string

const startCommand: Command = () => "started"

export const commands = { start: startCommand } satisfies Record<string, Command>
