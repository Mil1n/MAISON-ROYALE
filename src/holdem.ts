import { validCard, shuffledDeck, type Card } from './blackjack';

export type HoldemStreet = 'preflop' | 'flop' | 'turn' | 'river';
export type HoldemAction = { type: 'fold' | 'check' | 'call' | 'raise'; amount?: bigint };
export type HoldemLog = { seat: number; street: HoldemStreet; type: HoldemAction['type']; amount: bigint };
export type HoldemSeat = { id: number; name: string; hole: Card[]; stack: bigint; contribution: bigint; streetBet: bigint; folded: boolean; allIn: boolean };
export type HoldemHand = {
  id: string; date: string; stake: bigint; dealer: number; seats: HoldemSeat[]; deck: Card[]; cursor: number;
  board: Card[]; street: HoldemStreet; actor: number; bet: bigint; minRaise: bigint;
  pending: number[]; actedSinceFullRaise: number[]; actedAt: (bigint | null)[]; actions: HoldemLog[];
};
export type HoldemRound = {
  id: string; date: string; stake: bigint; payout: bigint; net: bigint; dealer: number;
  seats: HoldemSeat[]; board: Card[]; street: 'showdown' | 'fold'; winners: number[];
  awards: bigint[]; pot: bigint; actions: HoldemLog[]; deck: Card[];
};
export type HoldemTurn = { hand: HoldemHand; round: null } | { hand: null; round: HoldemRound };
export type HoldemValue = { category: number; label: string; ranks: number[]; cards: Card[] };
const names = ['Вы', 'Анна', 'Марк'];
const categories = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'];
const SMALL_BLIND = 10n, BIG_BLIND = 20n;
export const isHoldemStake = (stake: unknown): stake is bigint => typeof stake === 'bigint' && stake >= 200n;
const next = (seat: number) => (seat + 1) % 3;
const rank = (card: Card) => card % 13 === 0 ? 14 : card % 13 + 1;
export function compareHoldem(a: HoldemValue, b: HoldemValue): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.ranks.length, b.ranks.length); i++) {
    const delta = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0); if (delta) return delta;
  }
  return 0;
}
function five(cards: Card[]): HoldemValue {
  const sorted = cards.map(rank).sort((a, b) => b - a);
  const groups = [...new Set(sorted)].map(value => ({ value, count: sorted.filter(r => r === value).length }))
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const flush = cards.every(card => Math.floor(card / 13) === Math.floor(cards[0] / 13));
  const straight = groups.length === 5 && sorted[0] - sorted[4] === 4 ? sorted[0]
    : sorted.join(',') === '14,5,4,3,2' ? 5 : 0;
  let category = 0, ranks = sorted;
  if (flush && straight) { category = 8; ranks = [straight]; }
  else if (groups[0].count === 4) { category = 7; ranks = groups.map(g => g.value); }
  else if (groups[0].count === 3 && groups[1].count === 2) { category = 6; ranks = groups.map(g => g.value); }
  else if (flush) category = 5;
  else if (straight) { category = 4; ranks = [straight]; }
  else if (groups[0].count === 3) { category = 3; ranks = groups.map(g => g.value); }
  else if (groups[0].count === 2 && groups[1].count === 2) { category = 2; ranks = groups.map(g => g.value); }
  else if (groups[0].count === 2) { category = 1; ranks = groups.map(g => g.value); }
  return { category, label: categories[category], ranks, cards: [...cards] };
}
/** Best five of five, six or seven cards, with ace-low straights and full kickers. */
export function evaluateHoldem(cards: readonly Card[]): HoldemValue {
  if (cards.length < 5 || cards.length > 7 || cards.some(card => !validCard(card)) || new Set(cards).size !== cards.length)
    throw new RangeError('Нужны 5–7 разных карт.');
  let best: HoldemValue | undefined;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
    for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
      for (let e = d + 1; e < cards.length; e++) {
        const value = five([cards[a], cards[b], cards[c], cards[d], cards[e]]);
        if (!best || compareHoldem(value, best) > 0) best = value;
      }
  return best!;
}
const canAct = (seat: HoldemSeat) => !seat.folded && !seat.allIn;
function cloneHand(hand: HoldemHand): HoldemHand {
  return { ...hand, seats: hand.seats.map(seat => ({ ...seat, hole: [...seat.hole] })), deck: [...hand.deck],
    board: [...hand.board], pending: [...hand.pending], actedSinceFullRaise: [...hand.actedSinceFullRaise],
    actedAt: [...hand.actedAt], actions: hand.actions.map(action => ({ ...action })) };
}
function pay(seat: HoldemSeat, amount: bigint) {
  if (amount < 0n || amount > seat.stack) throw new RangeError('Недостаточно фишек.');
  seat.stack -= amount; seat.contribution += amount; seat.streetBet += amount; seat.allIn = seat.stack === 0n;
}
export function getLegalActions(hand: HoldemHand) {
  const seat = hand.seats[hand.actor];
  const toCall = hand.bet - seat.streetBet;
  const maxRaiseTo = seat.streetBet + seat.stack;
  const minRaiseTo = hand.bet + hand.minRaise;
  const facedAt = hand.actedAt[hand.actor];
  const reopened = facedAt === null || hand.bet - facedAt >= hand.minRaise;
  // A sole player with chips cannot create a side pot against only all-in opponents.
  const opponentCanAct = hand.seats.some(other => other.id !== seat.id && canAct(other));
  return { toCall, callAmount: toCall < seat.stack ? toCall : seat.stack, minRaiseTo, maxRaiseTo,
    canCheck: toCall === 0n, canCall: toCall > 0n, canFold: true,
    canRaise: reopened && maxRaiseTo > hand.bet && opponentCanAct && hand.actions.length < 1980 };
}
function dealStreet(hand: HoldemHand) {
  hand.cursor++; // Burn before every board street.
  const count = hand.street === 'preflop' ? 3 : 1;
  hand.board.push(...hand.deck.slice(hand.cursor, hand.cursor + count)); hand.cursor += count;
  hand.street = hand.street === 'preflop' ? 'flop' : hand.street === 'flop' ? 'turn' : 'river';
  hand.seats.forEach(seat => { seat.streetBet = 0n; });
  hand.bet = 0n; hand.minRaise = BIG_BLIND; hand.actedAt = [null, null, null]; hand.actedSinceFullRaise = [];
  hand.pending = [next(hand.dealer), next(next(hand.dealer)), hand.dealer].filter(index => canAct(hand.seats[index]));
  hand.actor = hand.pending[0] ?? 0;
}
/** Exact side pots, with odd chips awarded clockwise starting left of the button. */
export function holdemAwards(seats: readonly HoldemSeat[], board: readonly Card[], dealer: number): bigint[] {
  const awards = [0n, 0n, 0n];
  const alive = seats.filter(seat => !seat.folded);
  const pot = seats.reduce((sum, seat) => sum + seat.contribution, 0n);
  if (alive.length === 1) { awards[alive[0].id] = pot; return awards; }
  const values = seats.map(seat => seat.folded ? null : evaluateHoldem([...seat.hole, ...board]));
  const levels = [...new Set(seats.map(seat => seat.contribution).filter(value => value > 0n))].sort((a, b) => a < b ? -1 : 1);
  let previous = 0n;
  for (const level of levels) {
    const contributors = seats.filter(seat => seat.contribution >= level);
    const amount = (level - previous) * BigInt(contributors.length); previous = level;
    const eligible = contributors.filter(seat => !seat.folded);
    if (!eligible.length) throw new Error('Некорректный побочный банк.');
    let best = values[eligible[0].id]!;
    for (const seat of eligible) if (compareHoldem(values[seat.id]!, best) > 0) best = values[seat.id]!;
    const winners = eligible.filter(seat => compareHoldem(values[seat.id]!, best) === 0)
      .sort((a, b) => (a.id - dealer + 2) % 3 - (b.id - dealer + 2) % 3);
    const share = amount / BigInt(winners.length), odd = Number(amount % BigInt(winners.length));
    winners.forEach((seat, index) => { awards[seat.id] += share + (index < odd ? 1n : 0n); });
  }
  return awards;
}
function finish(hand: HoldemHand): HoldemTurn {
  const seats = hand.seats.map(seat => ({ ...seat, hole: [...seat.hole] }));
  const awards = holdemAwards(seats, hand.board, hand.dealer);
  const pot = seats.reduce((sum, seat) => sum + seat.contribution, 0n);
  seats.forEach(seat => { seat.stack += awards[seat.id]; });
  const payout = seats[0].stack;
  return { hand: null, round: { id: hand.id, date: hand.date, stake: hand.stake, payout, net: payout - hand.stake,
    dealer: hand.dealer, seats, board: [...hand.board], street: seats.filter(seat => !seat.folded).length === 1 ? 'fold' : 'showdown',
    winners: awards.map((amount, seat) => amount > 0n ? seat : -1).filter(seat => seat >= 0), awards, pot,
    actions: hand.actions.map(action => ({ ...action })), deck: [...hand.deck] } };
}
function progress(hand: HoldemHand): HoldemTurn {
  if (hand.seats.filter(seat => !seat.folded).length === 1) return finish(hand);
  hand.pending = hand.pending.filter(index => canAct(hand.seats[index]));
  if (!hand.pending.length) {
    if (hand.street === 'river') return finish(hand);
    if (hand.seats.filter(canAct).length <= 1) {
      while (hand.board.length < 5) dealStreet(hand);
      return finish(hand);
    }
    dealStreet(hand);
  }
  hand.actor = hand.pending[0];
  return { hand, round: null };
}
function create(stake: bigint, dealer: number, deck: Card[], id: string, date: string): HoldemTurn {
  if (!isHoldemStake(stake) || !Number.isInteger(dealer) || dealer < 0 || dealer > 2 || deck.length !== 52 || deck.some(card => !validCard(card)) || new Set(deck).size !== 52)
    throw new RangeError('Бай-ин от 200 фишек; нужна полная колода.');
  const seats: HoldemSeat[] = names.map((name, id) => ({ id, name, hole: [], stack: stake, contribution: 0n, streetBet: 0n, folded: false, allIn: false }));
  let cursor = 0;
  for (let pass = 0; pass < 2; pass++) for (let offset = 1; offset <= 3; offset++) seats[(dealer + offset) % 3].hole.push(deck[cursor++]);
  pay(seats[next(dealer)], SMALL_BLIND); pay(seats[next(next(dealer))], BIG_BLIND);
  return { hand: { id, date, stake, dealer, seats, deck: [...deck], cursor, board: [], street: 'preflop', actor: dealer,
    bet: BIG_BLIND, minRaise: BIG_BLIND, pending: [dealer, next(dealer), next(next(dealer))], actedAt: [null, null, null], actedSinceFullRaise: [], actions: [] }, round: null };
}
export function startHoldem(stake: bigint, dealer = 0, explicitDeck?: readonly Card[]): HoldemTurn {
  return create(stake, dealer, explicitDeck ? [...explicitDeck] : shuffledDeck(), crypto.randomUUID(), new Date().toISOString());
}
function apply(hand: HoldemHand, action: HoldemAction): HoldemTurn {
  const result = cloneHand(hand), seat = result.seats[result.actor], legal = getLegalActions(result);
  if (!canAct(seat) || !result.pending.includes(result.actor) || result.actions.length >= 2000) throw new Error('Ход недоступен.');
  let amount = 0n;
  if (action.type === 'fold') seat.folded = true;
  else if (action.type === 'check') { if (!legal.canCheck) throw new Error('Для чека нужно уравнять ставку.'); }
  else if (action.type === 'call') { if (!legal.canCall) throw new Error('Нет ставки для колла.'); amount = legal.callAmount; pay(seat, amount); }
  else if (action.type === 'raise') {
    const target = action.amount;
    if (!legal.canRaise || typeof target !== 'bigint' || target <= result.bet || target > legal.maxRaiseTo || (target < legal.minRaiseTo && target !== legal.maxRaiseTo))
      throw new Error('Недопустимое повышение. Минимальный рейз или олл-ин.');
    const increase = target - result.bet;
    pay(seat, target - seat.streetBet); amount = target;
    result.bet = target;
    if (increase >= result.minRaise) { result.minRaise = increase; result.actedAt = [null, null, null]; result.actedSinceFullRaise = []; }
    // A short all-in still requires calls, but does not automatically reopen raising.
    result.pending = [next(seat.id), next(next(seat.id))].filter(index => canAct(result.seats[index]) && (result.seats[index].streetBet < target || result.pending.includes(index)));
  } else throw new Error('Неизвестное действие.');
  result.actions.push({ seat: result.actor, street: result.street, type: action.type, amount });
  result.actedAt[seat.id] = result.bet;
  if (!result.actedSinceFullRaise.includes(seat.id)) result.actedSinceFullRaise.push(seat.id);
  result.pending = result.pending.filter(index => index !== seat.id);
  return progress(result);
}
export function actHoldem(hand: HoldemHand, action: HoldemAction): HoldemTurn {
  // Public transitions accept only structurally and financially consistent states.
  if (!validHoldemHand(hand)) throw new Error('Некорректная сохранённая раздача.');
  return apply(hand, action);
}
/** A simple opponent: its decision never reads another player's private cards or the deck. */
export function botAction(hand: HoldemHand): HoldemAction {
  const seat = hand.seats[hand.actor], legal = getLegalActions(hand);
  const own = seat.hole.map(rank), pair = own[0] === own[1];
  const made = hand.board.length >= 3 ? evaluateHoldem([...seat.hole, ...hand.board]).category : pair ? 1 : 0;
  const strong = made >= 2 || pair && own[0] >= 10 || own.every(value => value >= 11);
  const weak = made === 0 && Math.max(...own) < 12;
  const expensive = legal.callAmount > hand.stake / 5n;
  const chance = Math.random();
  if (legal.canRaise && strong && chance < .28) {
    const target = legal.minRaiseTo + (hand.bet || BIG_BLIND);
    return { type: 'raise', amount: target < legal.maxRaiseTo ? target : legal.maxRaiseTo };
  }
  if (legal.canCall && weak && expensive && chance < .65) return { type: 'fold' };
  return { type: legal.canCheck ? 'check' : 'call' };
}

const invalid = (): never => { throw new Error('Повреждены данные техасского холдема.'); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function money(value: unknown, signed = false): bigint {
  if (typeof value === 'bigint') { if (!signed && value < 0n) return invalid(); return value; }
  if (typeof value !== 'string' || !(signed ? /^(0|-?[1-9][0-9]*)$/ : /^(0|[1-9][0-9]*)$/).test(value)) return invalid();
  return BigInt(value);
}
function stable(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Replaying the public actions catches forged stacks, cards, pots and betting rights. */
function replay(value: unknown): HoldemTurn {
  const source = object(value);
  if (typeof source.id !== 'string' || !source.id || source.id.length >= 100 || typeof source.date !== 'string' || !Number.isFinite(Date.parse(source.date)) || !Array.isArray(source.deck) || !Array.isArray(source.actions) || source.actions.length > 2000) return invalid();
  let turn = create(money(source.stake), source.dealer as number, source.deck as Card[], source.id, source.date);
  for (const value of source.actions) {
    const log = object(value);
    if (!turn.hand || log.seat !== turn.hand.actor || log.street !== turn.hand.street || !['fold', 'check', 'call', 'raise'].includes(log.type as string)) return invalid();
    turn = apply(turn.hand, { type: log.type as HoldemAction['type'], amount: log.type === 'raise' ? money(log.amount) : undefined });
    const actual = (turn.hand ?? turn.round).actions.at(-1)!;
    if (actual.amount !== money(log.amount)) return invalid();
  }
  return turn;
}
export function parseHoldemHand(value: unknown): HoldemHand {
  const source = object(value), turn = replay(source);
  if (!turn.hand || stable(source) !== stable(turn.hand)) return invalid();
  return turn.hand;
}
export function parseHoldemRound(value: unknown): HoldemRound {
  const source = object(value), turn = replay(source);
  if (!turn.round || stable(source) !== stable(turn.round)) return invalid();
  return turn.round;
}
export function validHoldemHand(value: unknown): value is HoldemHand { try { parseHoldemHand(value); return true; } catch { return false; } }
export function validHoldemRound(value: unknown): value is HoldemRound { try { parseHoldemRound(value); return true; } catch { return false; } }
