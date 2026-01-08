import { BaseConnector } from '../base'
import type { Message } from '../../core/message'

export type TelegramConnectorOptions = {
  interval_ms?: number
  id: string
  webhook_enabled?: boolean
  webhook_secret?: string
  bot_token?: string
  webhook_url?: string
  allowed_updates?: string[]
  poll_timeout_sec?: number
}

export class TelegramConnector extends BaseConnector {
  private intervalMs: number
  private webhookEnabled: boolean
  private webhookSecret?: string
  private botToken?: string
  private webhookUrl?: string
  private allowedUpdates?: string[]
  private pollTimeoutSec: number
  private offset = 0
  private abortController: AbortController | null = null

  constructor(options: TelegramConnectorOptions) {
    super('telegram', options.id)
    this.intervalMs = options.interval_ms ?? 5000
    this.webhookEnabled = options.webhook_enabled ?? false
    this.webhookSecret = options.webhook_secret
    this.botToken = options.bot_token
    this.webhookUrl = options.webhook_url
    this.allowedUpdates = options.allowed_updates
    this.pollTimeoutSec = options.poll_timeout_sec ?? 25
  }

  async start() {
    if (this.running) return
    this.running = true

    if (!this.botToken) {
      console.warn(`[telegram:${this.id}] bot_token missing; skipping start`)
      return
    }

    if (this.webhookEnabled) {
      if (this.webhookUrl) {
        await this.setWebhook(this.webhookUrl)
      }
      return
    }

    this.abortController = new AbortController()
    void this.pollLoop()
  }

  async stop() {
    if (!this.running) return
    this.running = false
    if (this.abortController) this.abortController.abort()
  }

  async handleWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ) {
    if (this.webhookSecret) {
      const secret = headers['x-telegram-bot-api-secret-token']
      if (secret !== this.webhookSecret) return null
    }

    if (!payload || typeof payload !== 'object') return null
    const update = payload as {
      update_id?: number
      message?: TelegramMessage
      channel_post?: TelegramMessage
    }

    const msg = update.message ?? update.channel_post
    if (!msg) return null

    return this.normalizeMessage(msg)
  }

  private normalizeMessage(msg: TelegramMessage): Message {
    const createdAt = msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString()
    return {
      id: String(msg.message_id ?? msg.message_thread_id ?? Date.now()),
      platform: 'telegram',
      source_id: this.id,
      channel_id: String(msg.chat?.id ?? 'unknown'),
      author_id: String(msg.from?.id ?? msg.sender_chat?.id ?? 'unknown'),
      content: msg.text ?? msg.caption ?? '',
      created_at: createdAt,
      raw: msg,
    }
  }

  private async pollLoop() {
    if (!this.botToken || !this.abortController) return

    while (this.running) {
      try {
        const params = new URLSearchParams()
        params.set('timeout', String(this.pollTimeoutSec))
        params.set('offset', String(this.offset))
        if (this.allowedUpdates?.length) {
          params.set('allowed_updates', JSON.stringify(this.allowedUpdates))
        }

        const res = await fetch(
          `https://api.telegram.org/bot${this.botToken}/getUpdates?${params.toString()}`,
          { signal: this.abortController.signal },
        )

        if (!res.ok) {
          await sleep(this.intervalMs)
          continue
        }

        const data = (await res.json()) as TelegramUpdatesResponse
        if (!data.ok || !Array.isArray(data.result)) {
          await sleep(this.intervalMs)
          continue
        }

        for (const update of data.result) {
          if (typeof update.update_id === 'number') {
            this.offset = update.update_id + 1
          }

          const msg =
            update.message ??
            update.channel_post ??
            update.edited_message ??
            update.edited_channel_post
          if (!msg) continue
          this.emit(this.normalizeMessage(msg))
        }
      } catch (error) {
        if (this.abortController.signal.aborted) break
        await sleep(this.intervalMs)
      }
    }
  }

  private async setWebhook(url: string) {
    if (!this.botToken) return
    const params = new URLSearchParams()
    params.set('url', url)
    if (this.webhookSecret) {
      params.set('secret_token', this.webhookSecret)
    }
    if (this.allowedUpdates?.length) {
      params.set('allowed_updates', JSON.stringify(this.allowedUpdates))
    }

    await fetch(`https://api.telegram.org/bot${this.botToken}/setWebhook`, {
      method: 'POST',
      body: params,
    })
  }
}

type TelegramMessage = {
  message_id?: number
  message_thread_id?: number
  date?: number
  text?: string
  caption?: string
  chat?: {
    id?: number | string
  }
  from?: {
    id?: number | string
  }
  sender_chat?: {
    id?: number | string
  }
}

type TelegramUpdate = {
  update_id?: number
  message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_message?: TelegramMessage
  edited_channel_post?: TelegramMessage
}

type TelegramUpdatesResponse = {
  ok?: boolean
  result?: TelegramUpdate[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
