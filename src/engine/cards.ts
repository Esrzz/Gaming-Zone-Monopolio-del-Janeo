import type { Card } from './types'

/**
 * Mazo de Suerte (16 cartas, estilo Monopoly clásico con tema gaming).
 * El array define el orden del mazo; el motor lo recorre cíclicamente.
 */
export const CHANCE_CARDS: Card[] = [
  {
    id: 'ch-01',
    text: '¡Te convertiste en el miembro más activo del server! Cobrá $200.',
    effect: { kind: 'move', to: 0 },
  },
  {
    id: 'ch-02',
    text: 'Te hiciste viral en YouTube. Avanzá hasta YouTube. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 5 },
  },
  {
    id: 'ch-03',
    text: 'Te contrataron para hacer streams. Avanzá hasta Twitch. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 25 },
  },
  {
    id: 'ch-04',
    text: 'Conseguiste un patrocinio gamer. Avanzá hasta Steam. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 35 },
  },
  {
    id: 'ch-05',
    text: 'El bot te manda a revisar el servicio más cercano. Si pertenece a otro jugador, pagale 10x el resultado de los dados.',
    effect: { kind: 'moveToNearest', tileKind: 'utility' },
  },
  {
    id: 'ch-06',
    text: 'Te invitaron a la plataforma más cercana. Si pertenece a otro jugador, pagale el doble del alquiler.',
    effect: { kind: 'moveToNearest', tileKind: 'platform' },
  },
  {
    id: 'ch-07',
    text: 'El Discord reconoce tu actividad y te recompensa. Cobrá $150 del Discord.',
    effect: { kind: 'collectFromBank', amount: 150 },
  },
  {
    id: 'ch-08',
    text: 'Un moderador te perdonó la sanción. Guardá esta carta para salir de la cárcel.',
    effect: { kind: 'getOutOfJail' },
  },
  {
    id: 'ch-09',
    text: 'Te equivocaste de canal y terminaste en cualquier lado. Retrocedé 3 casillas.',
    effect: { kind: 'moveRelative', steps: -3 },
  },
  {
    id: 'ch-10',
    text: 'Te banearon por romper las reglas. Andá a la cárcel. No pases por la Salida, no cobrés $200.',
    effect: { kind: 'goToJail' },
  },
  {
    id: 'ch-11',
    text: 'El mantenimiento del servidor salió más caro de lo esperado. Pagá $25 por cada casa y $100 por cada hotel al Discord.',
    effect: { kind: 'repairs', houseCost: 25, hotelCost: 100 },
  },
  {
    id: 'ch-12',
    text: 'Te denunciaron por spam. Pagá $15 de multa al Discord.',
    effect: { kind: 'payBank', amount: 15 },
  },
  {
    id: 'ch-13',
    text: '¡Sos el rey del gaming! Avanzá al #1 del ranking de juegos del server. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 39 },
  },
  {
    id: 'ch-14',
    text: 'Ganaste el torneo oficial del Discord. Cada jugador te paga $100.',
    effect: { kind: 'collectFromPlayers', amount: 100 },
  },
  {
    id: 'ch-15',
    text: 'Te olvidaste de cancelar Discord Nitro. Pagá $50 al Discord.',
    effect: { kind: 'payBank', amount: 50 },
  },
  {
    id: 'ch-16',
    text: 'Tu playlist se volvió la favorita del canal de música. Avanzá hasta Spotify. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 15 },
  },
]
export const CHEST_CARDS: Card[] = [
  {
    id: 'cc-01',
    text: 'Volviste a conectarte después de meses. ¡El server te recibe con $200! Avanzá a la Salida.',
    effect: { kind: 'move', to: 0 },
  },
  {
    id: 'cc-02',
    text: 'El administrador se equivocó al configurar los permisos y te transfirió dinero. Cobrá $200 del Discord.',
    effect: { kind: 'collectFromBank', amount: 200 },
  },
  {
    id: 'cc-03',
    text: 'Se cayó el internet justo en medio de una partida. Pagá $50 al Discord por los gastos de reconexión.',
    effect: { kind: 'payBank', amount: 50 },
  },
  {
    id: 'cc-04',
    text: 'Te llegó el paquete de merch oficial del Discord. ¡Cobrá $50!',
    effect: { kind: 'collectFromBank', amount: 50 },
  },
  {
    id: 'cc-05',
    text: 'Un administrador te levantó el ban. Guardá esta carta para salir de la cárcel.',
    effect: { kind: 'getOutOfJail' },
  },
  {
    id: 'cc-06',
    text: 'Te descubrieron usando cheats en el servidor. ¡Ban permanente! Andá a la cárcel. No pases por la Salida, no cobrés $200.',
    effect: { kind: 'goToJail' },
  },
  {
    id: 'cc-07',
    text: '¡Es tu cumpleaños! Los miembros del Discord te hacen una colecta. Cada jugador te da $50.',
    effect: { kind: 'collectFromPlayers', amount: 50 },
  },
  {
    id: 'cc-08',
    text: 'Te devolvieron el dinero de un juego que compraste por error. Cobrá $100.',
    effect: { kind: 'collectFromBank', amount: 100 },
  },
  {
    id: 'cc-09',
    text: 'Ganaste un sorteo organizado por el Discord. Cobrá $100.',
    effect: { kind: 'collectFromBank', amount: 100 },
  },
  {
    id: 'cc-10',
    text: 'Tu setup necesita mantenimiento. Pagá $40 por cada casa y $115 por cada hotel al Discord.',
    effect: { kind: 'repairs', houseCost: 40, hotelCost: 115 },
  },
  {
    id: 'cc-11',
    text: 'Tus inversiones en el server dieron resultado. Cobrá $50 en dividendos.',
    effect: { kind: 'collectFromBank', amount: 50 },
  },
  {
    id: 'cc-12',
    text: 'Te quedaste sin voz después de una noche entera gritando en el voice. Pagá $100 al Discord por honorarios médicos.',
    effect: { kind: 'payBank', amount: 100 },
  },
  {
    id: 'cc-13',
    text: 'No cancelaste Discord Nitro y se renovó automáticamente. Pagá $100 al Discord.',
    effect: { kind: 'payBank', amount: 100 },
  },
  {
    id: 'cc-14',
    text: 'Te pagaron el alquiler de un juego que prestaste a otro miembro. Cobrá $20.',
    effect: { kind: 'collectFromBank', amount: 20 },
  },
  {
    id: 'cc-15',
    text: 'Ganaste el concurso de memes del Discord. Cobrá $10.',
    effect: { kind: 'collectFromBank', amount: 10 },
  },
  {
    id: 'cc-16',
    text: 'Un miembro te devolvió un préstamo que le habías hecho. Cobrá $25.',
    effect: { kind: 'collectFromBank', amount: 25 },
  },
]
export function getCard(deck: 'chance' | 'chest', index: number) {
  const cards = deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS
  return cards[index % cards.length]
}
