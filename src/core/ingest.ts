import type { Hono } from 'hono'
import type { Message } from './message'

export type PollingResult = Message | Message[] | null | undefined
export type PollingFn = () => Promise<PollingResult> | PollingResult

type PollingOptions = {
  intervalMs: number
  poll: PollingFn
  emit: (msg: Message) => void
}

export class PollingIngest {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private options: PollingOptions) {}

  start() {
    if (this.running) return
    this.running = true

    this.timer = setInterval(async () => {
      const result = await this.options.poll()
      if (!result) return

      if (Array.isArray(result)) {
        for (const msg of result) this.options.emit(msg)
        return
      }

      this.options.emit(result)
    }, this.options.intervalMs)
  }

  stop() {
    if (!this.running) return
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}

export type WebhookHandler = (
  payload: unknown,
  headers: Record<string, string>,
) => Promise<PollingResult> | PollingResult

export const registerWebhook = (
  app: Hono,
  path: string,
  handler: WebhookHandler,
  emit: (msg: Message) => void,
) => {
  app.post(path, async (c) => {
    const headers: Record<string, string> = {}
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value
    })
    const payload = await c.req.json().catch(() => null)
    const result = await handler(payload, headers)

    if (Array.isArray(result)) {
      for (const msg of result) emit(msg)
    } else if (result) {
      emit(result)
    }

    return c.json({ ok: true })
  })
}
