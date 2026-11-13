import { z } from "zod"

const channels = {
  presence: z.object({ room: z.string() }),
}

type ChannelName = keyof typeof channels

export function addressChannel<Channel extends ChannelName>(channel: Channel, params: unknown) {
  const parsed = z.safeParse(channels[channel], params)

  if (!parsed.success) return { error: parsed.error }

  return { key: `${channel}:${JSON.stringify(parsed.data)}`, params: parsed.data }
}
