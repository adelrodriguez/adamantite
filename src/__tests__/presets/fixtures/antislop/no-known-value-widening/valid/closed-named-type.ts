type Command = () => void
const startCommand: Command = () => {}
interface Commands { readonly start: Command }
export const commands: Commands = { start: startCommand }
