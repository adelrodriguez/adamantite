type Message = { kind: "call"; method: string } | { kind: "stop" }

export function handleMessage(message: Message) {
  switch (message.kind) {
    case "call":
      return message.method
    case "stop":
      return "stopped"
  }
}
