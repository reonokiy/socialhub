import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'

export type ConnectorConfig = {
  id: string
  platform: string
  poll_interval_ms: number
  webhook_enabled?: boolean
  webhook_secret?: string
  bot_token?: string
  webhook_url?: string
  allowed_updates?: string[]
  poll_timeout_sec?: number
  base_url?: string
  access_token?: string
  timeline?: 'mentions' | 'public' | 'public:local' | 'home'
}

export type Config = {
  pipeline: {
    dedup_limit: number
  }
  connectors: ConnectorConfig[]
}

const DEFAULT_CONFIG: Config = {
  pipeline: {
    dedup_limit: 10000,
  },
  connectors: [
    {
      id: 'telegram-1',
      platform: 'telegram',
      poll_interval_ms: 5000,
      webhook_enabled: false,
    },
    {
      id: 'mastodon-1',
      platform: 'mastodon',
      poll_interval_ms: 7000,
      webhook_enabled: false,
    },
  ],
}

const mergeConfig = (base: Config, patch: Partial<Config>): Config => {
  return {
    pipeline: {
      ...base.pipeline,
      ...(patch.pipeline ?? {}),
    },
    connectors: patch.connectors ?? base.connectors,
  }
}

export const loadConfig = (path = process.env.CONFIG_PATH ?? 'config.yaml'): Config => {
  if (!existsSync(path)) return DEFAULT_CONFIG

  const raw = readFileSync(path, 'utf-8')
  const parsed = parse(raw) as Partial<Config> | null
  if (!parsed) return DEFAULT_CONFIG

  return mergeConfig(DEFAULT_CONFIG, parsed)
}
