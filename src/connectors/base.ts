import type { Hono } from 'hono'
import type { Message } from '../core/message'

export type MessageCallback = (msg: Message) => void

export interface Connector {
  start(): Promise<void>
  stop(): Promise<void>
  onMessage(cb: MessageCallback): void
  status(): ConnectorStatus
  handleWebhook?(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<Message | Message[] | null | undefined> | Message | Message[] | null | undefined
}

export type ConnectorStatus = {
  running: boolean
  last_message_at?: string
  platform: string
  id: string
}

export abstract class BaseConnector implements Connector {
  protected callback: MessageCallback | null = null
  protected running = false
  protected lastMessageAt?: string

  constructor(
    readonly platform: string,
    readonly id: string,
  ) {}

  onMessage(cb: MessageCallback) {
    this.callback = cb
  }

  status(): ConnectorStatus {
    return {
      running: this.running,
      last_message_at: this.lastMessageAt,
      platform: this.platform,
      id: this.id,
    }
  }

  protected emit(msg: Message) {
    this.lastMessageAt = new Date().toISOString()
    if (this.callback) this.callback(msg)
  }

  abstract start(): Promise<void>
  abstract stop(): Promise<void>
}
