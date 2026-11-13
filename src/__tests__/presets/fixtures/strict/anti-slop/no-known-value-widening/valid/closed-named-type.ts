type Command = () => string

const startCommand: Command = () => "started"

interface Commands {
  readonly start: Command
}

export const commands: Commands = { start: startCommand }
