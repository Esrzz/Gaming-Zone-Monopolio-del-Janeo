import type { GameEvent, Rules } from '../engine'
import { CHANCE_CARDS, CHEST_CARDS } from '../engine/cards'

export interface MoneyChange {
  player: string
  /** Positivo = cobró, negativo = pagó */
  amount: number
}

/** Cambios de plata que produce un evento (para los "+$200 / -$50" flotantes). */
export function moneyChanges(e: GameEvent, rules: Rules): MoneyChange[] {
  const out: MoneyChange[] = []
  const add = (player: string, amount: number) => {
    if (amount !== 0) out.push({ player, amount })
  }
  switch (e.type) {
    case 'paid':
      add(e.from, -e.amount)
      if (e.to !== 'bank' && e.to !== 'pot') add(e.to, e.amount)
      break
    case 'bought':
      add(e.player, -e.price)
      break
    case 'moved':
      if (e.passedGo) add(e.player, rules.goSalary)
      break
    case 'jackpot':
      add(e.player, e.amount)
      break
    case 'card-drawn': {
      const card = (e.deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS).find((c) => c.id === e.cardId)
      if (card?.effect.kind === 'collectFromBank') add(e.player, card.effect.amount)
      break
    }
    case 'trade-accepted': {
      const { from, to, give, get } = e.trade
      add(from, get.cash - give.cash)
      add(to, give.cash - get.cash)
      break
    }
  }
  return out
}
