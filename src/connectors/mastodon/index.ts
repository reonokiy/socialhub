import { BaseConnector } from '../base'
import type { Message } from '../../core/message'
import { PollingIngest } from '../../core/ingest'

export type MastodonConnectorOptions = {
  interval_ms?: number
  id: string
  webhook_enabled?: boolean
  webhook_secret?: string
  base_url?: string
  access_token?: string
  timeline?: 'mentions' | 'public' | 'public:local' | 'home'
}

export class MastodonConnector extends BaseConnector {
  private intervalMs: number
  private poller: PollingIngest | null = null
  private webhookEnabled: boolean
  private webhookSecret?: string
  private baseUrl?: string
  private accessToken?: string
  private timeline: 'mentions' | 'public' | 'public:local' | 'home'
  private sinceId?: string

  constructor(options: MastodonConnectorOptions) {
    super('mastodon', options.id)
    this.intervalMs = options.interval_ms ?? 7000
    this.webhookEnabled = options.webhook_enabled ?? false
    this.webhookSecret = options.webhook_secret
    this.baseUrl = options.base_url
    this.accessToken = options.access_token
    this.timeline = options.timeline ?? 'mentions'
  }

  async start() {
    if (this.running) return
    this.running = true

    if (!this.baseUrl || !this.accessToken) {
      console.warn(`[mastodon:${this.id}] base_url or access_token missing; skipping start`)
      return
    }

    if (this.webhookEnabled) return

    if (!this.poller) {
      this.poller = new PollingIngest({
        intervalMs: this.intervalMs,
        poll: () => this.pollOnce(),
        emit: (msg) => this.emit(msg),
      })
    }

    this.poller.start()
  }

  async stop() {
    if (!this.running) return
    this.running = false
    if (this.poller) this.poller.stop()
  }

  async handleWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ) {
    if (this.webhookSecret) {
      const secret = headers['x-webhook-secret']
      if (secret !== this.webhookSecret) return null
    }

    if (!payload || typeof payload !== 'object') return null
    const event = payload as MastodonStatus
    if (!event.id) return null

    return this.normalizeStatus(event)
  }

  private normalizeStatus(event: MastodonStatus): Message {
    return {
      id: String(event.id),
      platform: 'mastodon',
      source_id: this.id,
      channel_id: String(event.visibility ?? this.timeline),
      author_id: String(event.account?.id ?? 'unknown'),
      content: stripTags(event.content ?? ''),
      created_at: event.created_at ?? new Date().toISOString(),
      raw: event,
    }
  }

  private async pollOnce(): Promise<Message[] | null> {
    if (!this.baseUrl || !this.accessToken) return null

    const url = new URL(this.baseUrl)
    const path = this.timelinePath()
    const endpoint = new URL(path, url)
    endpoint.searchParams.set('limit', '20')
    if (this.sinceId) endpoint.searchParams.set('since_id', this.sinceId)

    const res = await fetch(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!res.ok) return null
    const data = (await res.json()) as MastodonPayload[]
    if (!Array.isArray(data) || data.length === 0) return null

    const messages: Message[] = []
    let maxId: string | undefined

    if (this.timeline === 'mentions') {
      for (const item of data) {
        if (item.type !== 'mention' || !item.status) continue
        messages.push(this.normalizeStatus(item.status))
        maxId = maxIdValue(maxId, item.id)
      }
    } else {
      for (const item of data) {
        if (!item.id) continue
        messages.push(this.normalizeStatus(item as MastodonStatus))
        maxId = maxIdValue(maxId, String(item.id))
      }
    }

    if (maxId) this.sinceId = maxId
    return messages.length ? messages : null
  }

  private timelinePath() {
    if (this.timeline === 'home') return '/api/v1/timelines/home'
    if (this.timeline === 'public:local') return '/api/v1/timelines/public?local=true'
    if (this.timeline === 'public') return '/api/v1/timelines/public'
    return '/api/v1/notifications?types[]=mention'
  }
}

const stripTags = (value: string) => value.replace(/<[^>]*>/g, '').trim()

type MastodonStatus = {
  id?: string | number
  content?: string
  created_at?: string
  visibility?: string
  account?: {
    id?: string | number
  }
}

type MastodonNotification = {
  id?: string
  type?: string
  status?: MastodonStatus
}

type MastodonPayload = MastodonStatus | MastodonNotification

const maxIdValue = (current?: string, next?: string) => {
  if (!next) return current
  if (!current) return next
  try {
    return BigInt(next) > BigInt(current) ? next : current
  } catch {
    return next > current ? next : current
  }
}
