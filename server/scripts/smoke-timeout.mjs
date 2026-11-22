// Prueba del reloj: levantar el servidor con `npx wrangler dev -c server/wrangler.toml --var TURN_SECONDS:3`
// y correr `node server/scripts/smoke-timeout.mjs`. Si nadie juega, el servidor tira, decide y pasa el turno solo.
const BASE = process.argv[2] ?? 'http://localhost:8787'
const WS = BASE.replace(/^http/, 'ws')
const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json()
const open = (name, token, create) => {
  const ws = new WebSocket(`${WS}/ws/${code}?token=${token}${create ? '&create=1' : ''}`)
  const msgs = []
  ws.addEventListener('message', (e) => msgs.push(JSON.parse(e.data)))
  ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'join', code, name })))
  return { ws, msgs }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const A = open('Ana', 'token-ana-timeout-0001', true)
await wait(500)
const B = open('Beto', 'token-beto-timeout-0001', false)
await wait(500)
B.ws.send(JSON.stringify({ t: 'ready', ready: true }))
await wait(300)
A.ws.send(JSON.stringify({ t: 'start' }))
await wait(500)

A.msgs.length = 0
await wait(6500)
const ups = A.msgs.filter((m) => m.t === 'update')
const types = ups.flatMap((u) => u.events.map((e) => e.type))
console.log('eventos automáticos:', types.join(', ') || '(ninguno)')

const ok = ups.length > 0 && types.includes('rolled') && types.includes('turn')
console.log(ok ? '✓ el turno pasó solo por tiempo agotado' : '✗ no avanzó')
A.ws.close(); B.ws.close()
process.exit(ok ? 0 : 1)
