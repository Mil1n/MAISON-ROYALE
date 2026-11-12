import { validCard, type Card } from './blackjack';
import type { Money } from './game';

export type BaccaratBet = 'player' | 'banker' | 'tie';
export type BaccaratRound = {
  id: string; date: string; stake: Money; bet: BaccaratBet;
  player: Card[]; banker: Card[]; winner: BaccaratBet; payout: Money; net: Money;
};
export const isBaccaratBet = (bet: unknown): bet is BaccaratBet => bet === 'player' || bet === 'banker' || bet === 'tie';
// Twenty-chip increments keep the banker's 5% commission exact, without rounding.
export const isBaccaratStake = (stake: unknown): stake is Money => typeof stake === 'bigint' && stake >= 20n && stake % 20n === 0n;
export function baccaratCardValue(card: Card): number {
  if (!validCard(card)) throw new RangeError('Некорректная карта.');
  return card % 13 < 9 ? card % 13 + 1 : 0;
}
export const baccaratValue = (cards: readonly Card[]): number => cards.reduce((sum, card) => sum + baccaratCardValue(card), 0) % 10;

/** Standard punto banco banker table. Null means the player stood. */
export function bankerDraws(total: number, playerThird: number | null): boolean {
  if (playerThird === null) return total <= 5;
  return total <= 2 || total === 3 && playerThird !== 8 || total === 4 && playerThird >= 2 && playerThird <= 7 || total === 5 && playerThird >= 4 && playerThird <= 7 || total === 6 && playerThird >= 6 && playerThird <= 7;
}

export function validBaccaratCards(player: readonly Card[], banker: readonly Card[]): boolean {
  const cards = [...player, ...banker];
  if (player.length < 2 || player.length > 3 || banker.length < 2 || banker.length > 3 || cards.some(card => !validCard(card))) return false;
  // Repeated faces are possible in a six-deck shoe, with at most six copies.
  if (cards.some(card => cards.filter(other => other === card).length > 6)) return false;
  const p = baccaratValue(player.slice(0, 2)), b = baccaratValue(banker.slice(0, 2));
  if (p >= 8 || b >= 8) return player.length === 2 && banker.length === 2;
  const playerMustDraw = p <= 5;
  if ((player.length === 3) !== playerMustDraw) return false;
  return (banker.length === 3) === bankerDraws(b, playerMustDraw ? baccaratCardValue(player[2]) : null);
}

export function evaluateBaccarat(player: readonly Card[], banker: readonly Card[], stake: Money, bet: BaccaratBet): Pick<BaccaratRound, 'winner' | 'payout' | 'net'> {
  if (!isBaccaratStake(stake) || !isBaccaratBet(bet)) throw new RangeError('Ставка должна быть кратна 20, минимум 20 фишек.');
  if (!validBaccaratCards(player, banker)) throw new RangeError('Карты не соответствуют правилам баккары.');
  const p = baccaratValue(player), b = baccaratValue(banker);
  const winner: BaccaratBet = p === b ? 'tie' : p > b ? 'player' : 'banker';
  const payout = winner === 'tie' ? bet === 'tie' ? stake * 9n : stake : winner !== bet ? 0n : bet === 'banker' ? stake * 39n / 20n : stake * 2n;
  return { winner, payout, net: payout - stake };
}

export function validBaccaratRound(round: BaccaratRound): boolean {
  try {
    if (typeof round.id !== 'string' || !round.id || typeof round.date !== 'string' || !Number.isFinite(Date.parse(round.date))) return false;
    const result = evaluateBaccarat(round.player, round.banker, round.stake, round.bet);
    return result.winner === round.winner && result.payout === round.payout && result.net === round.net;
  } catch { return false; }
}

function randomIndex(size: number): number {
  const sample = new Uint32Array(1), limit = 2 ** 32 - (2 ** 32 % size);
  do { crypto.getRandomValues(sample); } while (sample[0] >= limit);
  return sample[0] % size;
}
export function shuffledBaccaratShoe(): Card[] {
  const shoe = Array.from({ length: 312 }, (_, index) => index % 52);
  for (let i = shoe.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
  return shoe;
}

/** Six fresh decks per round; explicit shoes support reproducible rule tests. */
export function playBaccarat(stake: Money, bet: BaccaratBet, explicitShoe?: readonly Card[]): BaccaratRound {
  if (!isBaccaratStake(stake) || !isBaccaratBet(bet)) throw new RangeError('Ставка должна быть кратна 20, минимум 20 фишек.');
  const shoe = explicitShoe ? [...explicitShoe] : shuffledBaccaratShoe();
  const counts = Array<number>(52).fill(0);
  if (shoe.length !== 312 || shoe.some(card => !validCard(card))) throw new RangeError('Нужны шесть полных колод.');
  for (const card of shoe) counts[card]++;
  if (counts.some(count => count !== 6)) throw new RangeError('Нужны шесть полных колод.');
  const take = () => shoe.shift()!;
  const p1 = take(), b1 = take(), p2 = take(), b2 = take();
  const player = [p1, p2], banker = [b1, b2];
  const p = baccaratValue(player), b = baccaratValue(banker);
  if (p < 8 && b < 8) {
    const third = p <= 5 ? take() : null;
    if (third !== null) player.push(third);
    if (bankerDraws(b, third === null ? null : baccaratCardValue(third))) banker.push(take());
  }
  return { id: crypto.randomUUID(), date: new Date().toISOString(), stake, bet, player, banker, ...evaluateBaccarat(player, banker, stake, bet) };
}
