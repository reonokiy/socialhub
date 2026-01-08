# SocialHub Architecture (Simplified)

This document describes a minimal, modular architecture for real-time message
ingestion from multiple social platforms (e.g., Telegram channels, Mastodon).

## Goals
- Each platform adapter owns normalization.
- Downstream is platform-agnostic.
- Easy to add new platforms by implementing a small interface.

## High-Level Flow
Connector (normalize inside) -> Pipeline -> Storage/Queue

## Modules
1) connectors/*
   - One connector per platform.
   - Responsibilities:
     - Auth + subscription (stream or polling)
     - Reconnect + rate-limit handling
     - Normalize raw events into Message
   - Output: Message

2) core/
   - message.ts: unified Message type
   - pipeline.ts: dedup + filter + dispatch

3) storage/*
   - Optional outputs (DB, queue, webhook).

4) app.ts (Hono)
   - API/control plane (health, status, start/stop, per-connector endpoints).

5) runner.ts
   - Starts all connectors and wires pipeline.

6) config.yaml
   - Runtime configuration (poll intervals, connector instances, dedup limits).
   - Override path via CONFIG_PATH env.

## Unified Message Shape (Minimal)
Message {
  id: string
  platform: "telegram" | "mastodon" | string
  source_id: string
  channel_id: string
  author_id: string
  content: string
  created_at: string (ISO)
  raw: unknown
}

## Connector Interface (Minimal)
start(): Promise<void>
stop(): Promise<void>
onMessage(cb: (msg: Message) => void): void

## Config (Example)
pipeline:
  dedup_limit: 10000

connectors:
  - id: telegram-1
    platform: telegram
    poll_interval_ms: 5000
    webhook_enabled: false
    webhook_secret: ""
    webhook_url: ""
    bot_token: ""
    allowed_updates: []
    poll_timeout_sec: 25
  - id: mastodon-1
    platform: mastodon
    poll_interval_ms: 7000
    webhook_enabled: false
    webhook_secret: ""
    base_url: "https://mastodon.example"
    access_token: ""
    timeline: mentions

## Data Flow Details
1) Connector fetches raw event
2) Connector normalizes to Message
3) Pipeline processes (dedup/filter/dispatch)
4) Storage persists or forwards

## API Endpoints
GET /connector/:id/status
POST /connector/:id/webhook
GET /ws

## Notes
- Dedup key: platform + source_id + id
- Storage is optional; can be swapped or disabled.
