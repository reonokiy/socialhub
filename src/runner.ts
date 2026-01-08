import { loadConfig } from './core/config'
import { Pipeline } from './core/pipeline'
import { TelegramConnector } from './connectors/telegram'
import { MastodonConnector } from './connectors/mastodon'
import { consoleStorage } from './storage/console'
import type { Connector } from './connectors/base'
import type { Message } from './core/message'
import type { MessageHandler } from './core/pipeline'

export class Runner {
  private pipeline: Pipeline
  private connectors: Connector[] = []

  constructor() {
    const config = loadConfig()
    this.pipeline = new Pipeline({ dedupLimit: config.pipeline.dedup_limit })
    this.pipeline.addHandler(consoleStorage)

    for (const connectorConfig of config.connectors) {
      if (connectorConfig.platform === 'telegram') {
        const telegram = new TelegramConnector({
          id: connectorConfig.id,
          interval_ms: connectorConfig.poll_interval_ms,
          webhook_enabled: connectorConfig.webhook_enabled ?? false,
          webhook_secret: connectorConfig.webhook_secret,
        })
        this.connectors.push(telegram)
      }

      if (connectorConfig.platform === 'mastodon') {
        const mastodon = new MastodonConnector({
          id: connectorConfig.id,
          interval_ms: connectorConfig.poll_interval_ms,
          webhook_enabled: connectorConfig.webhook_enabled ?? false,
          webhook_secret: connectorConfig.webhook_secret,
        })
        this.connectors.push(mastodon)
      }
    }

    for (const connector of this.connectors) {
      connector.onMessage((msg) => {
        void this.pipeline.process(msg)
      })
    }
  }

  async start() {
    await Promise.all(this.connectors.map((c) => c.start()))
  }

  async stop() {
    await Promise.all(this.connectors.map((c) => c.stop()))
  }

  status() {
    return this.connectors.map((c) => c.status())
  }

  getConnector(id: string) {
    return this.connectors.find((c) => c.status().id === id) ?? null
  }

  processMessage(msg: Message) {
    void this.pipeline.process(msg)
  }

  addHandler(handler: MessageHandler) {
    this.pipeline.addHandler(handler)
  }
}
