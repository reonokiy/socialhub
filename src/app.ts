import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
import type { WSContext } from 'hono/ws'
import { Runner } from './runner'
import type { Message } from './core/message'

const app = new Hono()
const runner = new Runner()
let running = false
const sockets = new Set<WSContext>()

const emitWebhookResult = (
  result: Message | Message[] | null | undefined,
  emit: (msg: Message) => void,
) => {
  if (!result) return
  if (Array.isArray(result)) {
    for (const msg of result) emit(msg)
  } else {
    emit(result)
  }
}

runner.addHandler((msg) => {
  const payload = JSON.stringify(msg)
  sockets.forEach((ws) => {
    const readyState = (ws as { readyState?: number }).readyState
    if (readyState !== undefined && readyState !== 1) return
    ws.send(payload)
  })
})

app.get('/health', (c) => c.json({ ok: true }))

app.get('/status', (c) => {
  return c.json({
    running,
    connectors: runner.status(),
  })
})

app.get('/connector/:id/status', (c) => {
  const id = c.req.param('id')
  const connector = runner.getConnector(id)
  if (!connector) return c.json({ error: 'not_found' }, 404)
  return c.json(connector.status())
})

app.post('/connector/:id/webhook', async (c) => {
  const id = c.req.param('id')
  const connector = runner.getConnector(id)
  if (!connector) return c.json({ error: 'not_found' }, 404)
  if (!connector.handleWebhook) return c.json({ error: 'not_supported' }, 404)

  const headers: Record<string, string> = {}
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value
  })
  const payload = await c.req.json().catch(() => null)
  const result = await connector.handleWebhook(payload, headers)

  emitWebhookResult(result, (msg) => {
    runner.processMessage(msg)
  })

  return c.json({ ok: true })
})

app.get(
  '/ws',
  upgradeWebSocket(() => ({
    onOpen: (_event, ws) => {
      sockets.add(ws)
    },
    onClose: (_event, ws) => {
      sockets.delete(ws)
    },
    onError: (_event, ws) => {
      sockets.delete(ws)
    },
  })),
)

app.post('/start', async (c) => {
  if (!running) {
    await runner.start()
    running = true
  }
  return c.json({ running })
})

app.post('/stop', async (c) => {
  if (running) {
    await runner.stop()
    running = false
  }
  return c.json({ running })
})

export default app
