type Command = () => void
const startCommand: Command = () => {}
export const commands: { start: Command } = { start: startCommand }
