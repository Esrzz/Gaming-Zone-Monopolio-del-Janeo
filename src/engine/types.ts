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
  | { kind: 'property'; name: string; group: GroupId; price: number; rent: RentTable; houseCost: number; icon?: string | null }
  /** Casillas de plataformas (las estaciones del Monopoly clásico): 25/50/100/200 según cuántas tengas */
  | { kind: 'platform'; name: string; price: number; icon?: string | null }
  /** Casillas de servicio (Mute y Deafen): alquiler 4x o 10x los dados */
  | { kind: 'utility'; name: string; price: number; icon?: string | null }
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
  /** Alquiler doble si tenés todo el grupo de color sin casas */
  doubleRentOnFullSet: boolean
  /** Variante: los impuestos van a un pozo que se cobra al caer en Estacionamiento */
  freeParkingJackpot: boolean
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
export interface GameState {
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
  /** Índices del tope de cada mazo (se avanzan al robar) */
  chanceIndex: number
  chestIndex: number
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

export type Action =
  | { type: 'roll'; player: PlayerId; dice: [number, number] }
  | { type: 'buy'; player: PlayerId }
  | { type: 'decline'; player: PlayerId }
  | { type: 'endTurn'; player: PlayerId }
  | { type: 'payJailFine'; player: PlayerId }
  | { type: 'useJailCard'; player: PlayerId }
  | { type: 'bankrupt'; player: PlayerId }
  | { type: 'drawCard'; player: PlayerId }

/** Eventos que la interfaz usa para animar (movimiento de fichas, avisos, chat de sistema). */
export type GameEvent =
  | { type: 'rolled'; player: PlayerId; dice: [number, number] }
  | { type: 'moved'; player: PlayerId; from: number; to: number; steps: number; passedGo: boolean }
  | { type: 'bought'; player: PlayerId; tile: number; price: number }
  | { type: 'declined'; player: PlayerId; tile: number }
  | { type: 'rent'; from: PlayerId; to: PlayerId; tile: number; amount: number }
  | { type: 'paid'; from: PlayerId; to: PlayerId | 'bank' | 'pot'; amount: number }
  | { type: 'jackpot'; player: PlayerId; amount: number }
  | { type: 'jailed'; player: PlayerId }
  | { type: 'left-jail'; player: PlayerId; how: 'doubles' | 'fine' | 'card' | 'forced' }
  | { type: 'card-pending'; player: PlayerId; deck: 'chance' | 'chest' }
  | { type: 'card-drawn'; player: PlayerId; deck: 'chance' | 'chest'; cardId: string; text: string }
  | { type: 'bankrupt'; player: PlayerId; creditor: PlayerId | null }
  | { type: 'turn'; player: PlayerId }
  | { type: 'won'; player: PlayerId }

export type Result =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string }
