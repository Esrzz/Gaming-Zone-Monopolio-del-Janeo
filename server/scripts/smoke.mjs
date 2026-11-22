// Prueba de humo del servidor: dos clientes juegan por WebSocket contra `npm run server:dev`.
// Uso: node server/scripts/smoke.mjs [http://localhost:8787]
const BASE = process.argv[2] ?? 'http://localhost:8787'
const WS = BASE.replace(/^http/, 'ws')
let failed = 0
const check = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) failed++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

class Client {
  constructor(name, token, code, create) {
    this.name = name
    this.msgs = []
    this.ws = new WebSocket(`${WS}/ws/${code}?token=${token}${create ? '&create=1' : ''}`)
    this.open = new Promise((res) => this.ws.addEventListener('open', res))
    this.ws.addEventListener('message', (e) => this.msgs.push(JSON.parse(e.data)))
    this.code = code
  }
  send(m) { this.ws.send(JSON.stringify(m)) }
  join() { this.send({ t: 'join', code: this.code, name: this.name }) }
  async until(pred, label, ms = 3000) {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const m = this.msgs.find(pred)
      if (m) return m
      await wait(25)
    }
    throw new Error(`timeout esperando: ${label}`)
  }
  last(t) { return [...this.msgs].reverse().find((m) => m.t === t) }
  clear() { this.msgs = [] }
}

const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json()
check(/^[A-Z0-9]{5}$/.test(code), `código de sala ${code}`)

const tokA = 'token-de-ana-' + Math.random().toString(36).slice(2)
const tokB = 'token-de-beto-' + Math.random().toString(36).slice(2)

// una sala que no existe no se puede unir
{
  const x = new Client('Fantasma', 'token-fantasma-123456', 'ZZZZZ', false)
  await x.open
  x.join()
  const e = await x.until((m) => m.t === 'error', 'error sala inexistente')
  check(/no existe/.test(e.error), 'unirse a una sala inexistente da error')
  x.ws.close()
}

const A = new Client('Ana', tokA, code, true)
await A.open
A.join()
const roomA = await A.until((m) => m.t === 'room', 'room de Ana')
check(roomA.room.hostId === roomA.you, 'Ana es host')

const B = new Client('Beto', tokB, code, false)
await B.open
B.join()
const roomB = await B.until((m) => m.t === 'room', 'room de Beto')
check(roomB.room.members.length === 2 && roomB.you !== roomA.you, 'Beto entra y tiene otro id')

// Beto no es host: no puede empezar ni cambiar reglas
B.send({ t: 'start' })
check(/host|anfitri/i.test((await B.until((m) => m.t === 'error', 'error start de Beto')).error), 'solo el host puede empezar')

B.send({ t: 'ready', ready: true })
await A.until((m) => m.t === 'room' && m.room.members.every((x) => x.ready), 'todos listos')
A.clear(); B.clear()
A.send({ t: 'start' })
const started = await A.until((m) => m.t === 'room' && m.room.status === 'playing', 'partida iniciada')
check(started.room.game.rng === 0 && started.room.game.decks.chance.draw.every((c) => c === ''), 'el estado público oculta el orden de los mazos y la semilla')
check(started.clock && started.clock.turnMsLeft > 200_000, `reloj de turno ~${Math.round(started.clock.turnMsLeft / 1000)}s`)

const game = started.room.game
const turnId = game.players[game.current].id
const [P, Q] = turnId === roomA.you ? [A, B] : [B, A]
const pid = turnId

// dados del cliente: rechazado
P.clear()
P.send({ t: 'action', action: { type: 'roll', player: pid, dice: [6, 6] } })
check(/dados/i.test((await P.until((m) => m.t === 'error', 'error dados')).error), 'el servidor rechaza dados mandados por el cliente')

// jugar por el otro: rechazado
Q.clear()
Q.send({ t: 'action', action: { type: 'roll', player: pid } })
check((await Q.until((m) => m.t === 'error', 'error jugar por otro')).error.length > 0, 'no se puede jugar por otro')

// tirada válida: el servidor tira
A.clear(); B.clear()
P.send({ t: 'action', action: { type: 'roll', player: pid } })
const up = await Q.until((m) => m.t === 'update', 'update de la tirada')
const roll = up.events.find((e) => e.type === 'rolled')
check(roll && roll.dice.length === 2 && roll.dice.every((d) => d >= 1 && d <= 6), `el servidor tiró los dados: ${roll?.dice}`)
check(up.seq > 0, `seq=${up.seq}`)

// acciones con forma inválida
P.send({ t: 'action', action: { type: 'abandon', player: pid } })
check((await P.until((m) => m.t === 'error' && m !== undefined, 'abandon')).t === 'error', 'abandon no se acepta desde el cliente')

// chat
A.clear(); B.clear()
Q.send({ t: 'chat', text: '  hola\n\n  janeo ' })
const chat = await P.until((m) => m.t === 'chat', 'chat')
check(chat.text === 'hola janeo', 'chat limpio y reenviado')

// reconexión: Beto se cae y vuelve con el mismo token
B.ws.close()
await A.until((m) => m.t === 'room' && m.room.members.some((x) => !x.connected), 'Beto desconectado')
check(true, 'se detecta la desconexión')
const B2 = new Client('Beto', tokB, code, false)
await B2.open
B2.join()
const back = await B2.until((m) => m.t === 'room', 'room tras reconectar')
check(back.you === roomB.you && back.room.members.every((x) => x.connected), 'Beto vuelve con su mismo id')

// token inválido
{
  const bad = new WebSocket(`${WS}/ws/${code}?token=corto`)
  const closed = await new Promise((res) => { bad.addEventListener('error', () => res('error')); bad.addEventListener('close', () => res('close')) })
  check(!!closed, 'token inválido rechazado')
}

A.ws.close(); B2.ws.close()
console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodo bien')
process.exit(failed ? 1 : 0)
