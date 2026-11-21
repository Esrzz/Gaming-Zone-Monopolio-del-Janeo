import type { Card } from './types'

/**
 * Mazo de Suerte (16 cartas, estilo Monopoly clásico con tema gaming).
 * El array define el orden del mazo; el motor lo recorre cíclicamente.
 */
export const CHANCE_CARDS: Card[] = [
  {
    id: 'ch-01',
    text: 'Avanzá a la Salida. Cobrá $200.',
    effect: { kind: 'move', to: 0 },
  },
  {
    id: 'ch-02',
    text: 'Avanzá a YouTube. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 5 },
  },
  {
    id: 'ch-03',
    text: 'Avanzá a Twitch. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 25 },
  },
  {
    id: 'ch-04',
    text: 'Avanzá a Steam. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 35 },
  },
  {
    id: 'ch-05',
    text: 'Avanzá al servicio más cercano. Si es de otro, pagá 10x los dados.',
    effect: { kind: 'moveToNearest', tileKind: 'utility' },
  },
  {
    id: 'ch-06',
    text: 'Avanzá a la plataforma más cercana. Si es de otro, pagá el doble.',
    effect: { kind: 'moveToNearest', tileKind: 'platform' },
  },
  {
    id: 'ch-07',
    text: 'El banco te recompensa por una buena racha. Cobrá $150.',
    effect: { kind: 'collectFromBank', amount: 150 },
  },
  {
    id: 'ch-08',
    text: 'Carta de Salida de la Cárcel. Guardala para cuando la necesites.',
    effect: { kind: 'getOutOfJail' },
  },
  {
    id: 'ch-09',
    text: 'Retrocedé 3 casillas.',
    effect: { kind: 'moveRelative', steps: -3 },
  },
  {
    id: 'ch-10',
    text: 'Andá a la cárcel. No pases por la Salida, no cobrés $200.',
    effect: { kind: 'goToJail' },
  },
  {
    id: 'ch-11',
    text: 'Reparaciones generales: pagá $25 por cada casa y $100 por cada hotel.',
    effect: { kind: 'repairs', houseCost: 25, hotelCost: 100 },
  },
  {
    id: 'ch-12',
    text: 'Pagá $15 de multa.',
    effect: { kind: 'payBank', amount: 15 },
  },
  {
    id: 'ch-13',
    text: 'Avanzá al #1 del ranking de juegos del server. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 39 },
  },
  {
    id: 'ch-14',
    text: 'Ganaste un torneo. Cobrá $100 de cada jugador.',
    effect: { kind: 'collectFromPlayers', amount: 100 },
  },
  {
    id: 'ch-15',
    text: 'Se te acumuló la suscripción. Pagá $50 al banco.',
    effect: { kind: 'payBank', amount: 50 },
  },
  {
    id: 'ch-16',
    text: 'Avanzá a Spotify. Si pasás por la Salida, cobrá $200.',
    effect: { kind: 'move', to: 15 },
  },
]

/**
 * Mazo de Arca Comunal (16 cartas, estilo Monopoly clásico con tema gaming).
 */
export const CHEST_CARDS: Card[] = [
  {
    id: 'cc-01',
    text: 'Avanzá a la Salida. Cobrá $200.',
    effect: { kind: 'move', to: 0 },
  },
  {
    id: 'cc-02',
    text: 'Error bancario a tu favor. Cobrá $200.',
    effect: { kind: 'collectFromBank', amount: 200 },
  },
  {
    id: 'cc-03',
    text: 'Pagás la factura de internet. Pagá $50 al banco.',
    effect: { kind: 'payBank', amount: 50 },
  },
  {
    id: 'cc-04',
    text: 'El server te manda merch. Cobrá $50.',
    effect: { kind: 'collectFromBank', amount: 50 },
  },
  {
    id: 'cc-05',
    text: 'Carta de Salida de la Cárcel. Guardala para cuando la necesites.',
    effect: { kind: 'getOutOfJail' },
  },
  {
    id: 'cc-06',
    text: 'Andá a la cárcel. No pases por la Salida, no cobrés $200.',
    effect: { kind: 'goToJail' },
  },
  {
    id: 'cc-07',
    text: 'Es tu cumple. Cada jugador te da $50.',
    effect: { kind: 'collectFromPlayers', amount: 50 },
  },
  {
    id: 'cc-08',
    text: 'Te reintegraron el pago de un juego. Cobrá $100.',
    effect: { kind: 'collectFromBank', amount: 100 },
  },
  {
    id: 'cc-09',
    text: 'Ganaste la lotería del server. Cobrá $100.',
    effect: { kind: 'collectFromBank', amount: 100 },
  },
  {
    id: 'cc-10',
    text: 'Reparaciones generales: pagá $40 por cada casa y $115 por cada hotel.',
    effect: { kind: 'repairs', houseCost: 40, hotelCost: 115 },
  },
  {
    id: 'cc-11',
    text: 'Cobrás dividendos de tus inversiones. Cobrá $50.',
    effect: { kind: 'collectFromBank', amount: 50 },
  },
  {
    id: 'cc-12',
    text: 'Pagás honorarios médicos. Pagá $100 al banco.',
    effect: { kind: 'payBank', amount: 100 },
  },
  {
    id: 'cc-13',
    text: 'Pagás impuesto a la herencia. Pagá $100 al banco.',
    effect: { kind: 'payBank', amount: 100 },
  },
  {
    id: 'cc-14',
    text: 'Cobrás el sueldo atrasado. Cobrá $20.',
    effect: { kind: 'collectFromBank', amount: 20 },
  },
  {
    id: 'cc-15',
    text: 'Ganás un concurso de juego. Cobrá $10.',
    effect: { kind: 'collectFromBank', amount: 10 },
  },
  {
    id: 'cc-16',
    text: 'Cobrás intereses sobre un préstamo. Cobrá $25.',
    effect: { kind: 'collectFromBank', amount: 25 },
  },
]

export function getCard(deck: 'chance' | 'chest', index: number) {
  const cards = deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS
  return cards[index % cards.length]
}
