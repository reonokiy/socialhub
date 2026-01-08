import type { Message } from './message'

export type MessageHandler = (msg: Message) => Promise<void> | void
export type MessageFilter = (msg: Message) => boolean

export type PipelineOptions = {
  dedupLimit?: number
}

export class Pipeline {
  private handlers: MessageHandler[] = []
  private filters: MessageFilter[] = []
  private dedup = new Map<string, number>()
  private dedupLimit: number

  constructor(options: PipelineOptions = {}) {
    this.dedupLimit = options.dedupLimit ?? 10000
  }

  addHandler(handler: MessageHandler) {
    this.handlers.push(handler)
  }

  addFilter(filter: MessageFilter) {
    this.filters.push(filter)
  }

  async process(msg: Message) {
    if (this.isDuplicate(msg)) return

    for (const filter of this.filters) {
      if (!filter(msg)) return
    }

    for (const handler of this.handlers) {
      await handler(msg)
    }
  }

  private isDuplicate(msg: Message) {
    const key = `${msg.platform}:${msg.source_id}:${msg.id}`
    if (this.dedup.has(key)) return true

    this.dedup.set(key, Date.now())

    if (this.dedup.size > this.dedupLimit) {
      // Basic pruning to avoid unbounded memory growth.
      const keys = this.dedup.keys()
      for (let i = 0; i < this.dedupLimit / 2; i += 1) {
        const k = keys.next().value
        if (!k) break
        this.dedup.delete(k)
      }
    }

    return false
  }
}
