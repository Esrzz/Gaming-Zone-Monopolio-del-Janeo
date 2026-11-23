export type PlayerId = string

export type GroupId =
  | 'brown'
  | 'lightblue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkblue'

/** Alquiler por cantidad de casas: [base, 1, 2, 3, 4, hotel] */
export type RentTable = [number, number, number, number, number, number]

export type Tile =
  | { kind: 'go'; name: string }
  | { kind: 'property'; name: string; group: GroupId; price: number; rent: RentTable; houseCost: number; icon?: string | null; description?: string }
  /** Casillas de plataformas (las estaciones del Monopoly clásico): ver `Rules.platformRent` */
  | { kind: 'platform'; name: string; price: number; icon?: string | null; description?: string }
  /** Casillas de servicio (Mute y Deafen): alquiler 4x o 10x los dados */
  | { kind: 'utility'; name: string; price: number; icon?: string | null; description?: string }
  | { kind: 'tax'; name: string; amount: number }
  | { kind: 'chance'; name: string }
  | { kind: 'chest'; name: string }
  | { kind: 'jail'; name: string }
  | { kind: 'gotojail'; name: string }
  | { kind: 'parking'; name: string }

/** Reglas configurables al crear la partida. Los valores por defecto son los oficiales. */
export interface Rules {
  startingCash: number
  goSalary: number
  jailFine: number
  /** Tiradas fallidas en la cárcel antes de pagar la multa a la fuerza */
  maxJailTurns: number
  /** Dobles seguidos que mandan a la cárcel */
  doublesToJail: number
  /** Multiplicador del alquiler base si tenés todo el grupo de color y sin casas (oficial: 2) */
  fullSetMultiplier: number
  /** Alquiler de las plataformas según cuántas tenga el dueño: [1, 2, 3, 4] */
  platformRent: number[]
  /** Casas y hoteles que hay en el banco al empezar (oficial: 32 y 12) */
  housesTotal: number
  hotelsTotal: number
  /** Variante: los impuestos van a un pozo que se cobra al caer en Estacionamiento */
  freeParkingJackpot: boolean
  /** Duración de cada turno en segundos (corre todo el turno); la fija el host al crear la partida */
  turnSeconds: number
}

export interface PlayerState {
  id: PlayerId
  name: string
  cash: number
  position: number
  inJail: boolean
  jailTurns: number
  jailCards: number
  bankrupt: boolean
}

export interface Ownership {
  owner: PlayerId
  mortgaged: boolean
  houses: number
}

/**
 * roll: esperando tirada. buy: cayó en una propiedad libre y debe decidir.
 * card: cayó en Suerte o Arca y debe robar carta.
 * end: puede terminar el turno. over: partida terminada.
 */
export type Phase = 'roll' | 'buy' | 'card' | 'end' | 'over'

/** Todo el estado es JSON plano: se puede guardar y mandar por red tal cual. */
/** Un juego del ranking del server (ocupa una calle). Sale de las stats del worker al crear la sala. */
export interface GameInfo {
  name: string
  hours: number
  icon: string | null
}

export interface GameState {
  /** Los 22 juegos de las calles, del más jugado al menos jugado (el #1 va en la calle más cara) */
  games: GameInfo[]
  rules: Rules
  players: PlayerState[]
  owned: Record<number, Ownership>
  /** Índice en `players` del jugador de turno */
  current: number
  phase: Phase
  doubles: number
  rollAgain: boolean
  lastDice: [number, number] | null
  pot: number
  winner: PlayerId | null
  /** Carta que está esperando ser robada (fase 'card') */
  pendingCard: { deck: 'chance' | 'chest'; cardId: string } | null
  /**
   * Mazos de cartas (ids). Se roba del tope de `draw`; las cartas usadas van a `discard` y, cuando `draw` se
   * vacía, se vuelven a barajar. La "salí libre de la cárcel" no vuelve hasta que se usa.
   * Es información privada: los clientes reciben el estado con `toPublicState` (sin el orden de los mazos).
   */
  decks: Record<DeckName, Deck>
  /** Semilla del generador de azar del motor (dados del servidor y barajado). Privada. */
  rng: number
  /** Cuenta de acciones aplicadas: sirve para detectar que a un cliente le faltó una actualización */
  seq: number
  /** Deudas pendientes: hay que juntar plata (vender casas, hipotecar, intercambiar) o declararse en bancarrota */
  debts: Debt[]
  /** Oferta de intercambio abierta (null si no hay) */
  trade: TradeOffer | null
}

export type DeckName = 'chance' | 'chest'

export interface Deck {
  draw: string[]
  discard: string[]
}

/** Lo que `from` le debe a `to` y todavía no pudo pagar. Mientras haya deudas no se puede avanzar el turno. */
export interface Debt {
  from: PlayerId
  to: PlayerId | 'bank'
  amount: number
}

export type CardEffect =
  | { kind: 'collectFromBank'; amount: number }
  | { kind: 'payBank'; amount: number }
  | { kind: 'collectFromPlayers'; amount: number }
  | { kind: 'payPlayers'; amount: number }
  | { kind: 'move'; to: number }
  | { kind: 'moveRelative'; steps: number }
  | { kind: 'moveToNearest'; tileKind: 'platform' | 'utility' }
  | { kind: 'goToJail' }
  | { kind: 'getOutOfJail' }
  | { kind: 'repairs'; houseCost: number; hotelCost: number }

export interface Card {
  id: string
  text: string
  effect: CardEffect
}

/** Lo que una de las partes pone en un intercambio. */
export interface TradeSide {
  cash: number
  /** Posiciones de las propiedades */
  properties: number[]
  jailCards: number
}

/** Oferta abierta: `from` da `give` y recibe `get` de `to`. Hay una sola oferta abierta a la vez. */
export interface TradeOffer {
  from: PlayerId
  to: PlayerId
  give: TradeSide
  get: TradeSide
}

export type Action =
  /** Sin `dice` el motor tira (así lo hace el servidor); con `dice` se usan esos (modo de prueba) */
  | { type: 'roll'; player: PlayerId; dice?: [number, number] }
  | { type: 'buy'; player: PlayerId }
  | { type: 'decline'; player: PlayerId }
  | { type: 'endTurn'; player: PlayerId }
  | { type: 'payJailFine'; player: PlayerId }
  | { type: 'useJailCard'; player: PlayerId }
  | { type: 'bankrupt'; player: PlayerId }
  /** Solo la manda el servidor: el jugador se fue y no volvió; sus bienes vuelven al banco */
  | { type: 'abandon'; player: PlayerId }
  | { type: 'drawCard'; player: PlayerId }
  | { type: 'proposeTrade'; player: PlayerId; to: PlayerId; give: TradeSide; get: TradeSide }
  | { type: 'acceptTrade'; player: PlayerId }
  | { type: 'rejectTrade'; player: PlayerId }
  | { type: 'cancelTrade'; player: PlayerId }
  /** Gestión de propiedades (solo en tu turno): construir una casa/hotel, venderla, hipotecar y levantar la hipoteca */
  | { type: 'build'; player: PlayerId; tile: number }
  | { type: 'sellHouse'; player: PlayerId; tile: number }
  | { type: 'mortgage'; player: PlayerId; tile: number }
  | { type: 'unmortgage'; player: PlayerId; tile: number }

/** Eventos que la interfaz usa para animar (movimiento de fichas, avisos, chat de sistema). */
export type GameEvent =
  | { type: 'rolled'; player: PlayerId; dice: [number, number] }
  | { type: 'moved'; player: PlayerId; from: number; to: number; steps: number; passedGo: boolean }
  | { type: 'bought'; player: PlayerId; tile: number; price: number }
  | { type: 'declined'; player: PlayerId; tile: number }
  | { type: 'rent'; from: PlayerId; to: PlayerId; tile: number; amount: number }
  | { type: 'paid'; from: PlayerId; to: PlayerId | 'bank' | 'pot'; amount: number }
  /** No alcanzó la plata pero se puede juntar vendiendo/hipotecando: queda una deuda pendiente */
  | { type: 'debt'; from: PlayerId; to: PlayerId | 'bank'; amount: number }
  | { type: 'jackpot'; player: PlayerId; amount: number }
  | { type: 'built'; player: PlayerId; tile: number; houses: number; cost: number }
  | { type: 'sold-house'; player: PlayerId; tile: number; houses: number; amount: number }
  | { type: 'mortgaged'; player: PlayerId; tile: number; amount: number }
  | { type: 'unmortgaged'; player: PlayerId; tile: number; cost: number }
  | { type: 'jailed'; player: PlayerId }
  | { type: 'left-jail'; player: PlayerId; how: 'doubles' | 'fine' | 'card' | 'forced' }
  | { type: 'card-pending'; player: PlayerId; deck: 'chance' | 'chest' }
  | { type: 'card-drawn'; player: PlayerId; deck: 'chance' | 'chest'; cardId: string; text: string }
  | { type: 'trade-proposed'; trade: TradeOffer }
  | { type: 'trade-accepted'; trade: TradeOffer }
  | { type: 'trade-rejected'; trade: TradeOffer }
  | { type: 'trade-cancelled'; trade: TradeOffer }
  | { type: 'bankrupt'; player: PlayerId; creditor: PlayerId | null }
  | { type: 'turn'; player: PlayerId }
  | { type: 'won'; player: PlayerId }

export type Result =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string }
