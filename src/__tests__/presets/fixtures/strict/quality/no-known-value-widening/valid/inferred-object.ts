type Command = () => string

const startCommand: Command = () => "started"

export const commands = { start: startCommand }
