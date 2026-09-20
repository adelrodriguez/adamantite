type Command = () => void
const startCommand: Command = () => {}
export const commands: { [key: string]: Command } = { start: startCommand }
