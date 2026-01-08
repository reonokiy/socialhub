import type { Message } from '../core/message'

export const consoleStorage = async (msg: Message) => {
  // Simple sink for demo.
  console.log(
    `[${msg.platform}:${msg.source_id}] ${msg.channel_id} ${msg.id}: ${msg.content}`,
  )
}
