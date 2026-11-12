import { describe, expect, it } from 'vitest';
import { baccaratCardValue, baccaratValue, bankerDraws, evaluateBaccarat, isBaccaratStake, playBaccarat, shuffledBaccaratShoe, validBaccaratCards, validBaccaratRound } from './baccarat';

function shoe(...first: number[]) {
  const rest = Array.from({ length: 312 }, (_, i) => i % 52);
  first.forEach(card => rest.splice(rest.indexOf(card), 1));
  return [...first, ...rest];
}

describe('punto banco', () => {
  it('counts aces as one, court cards as zero, and keeps the last digit', () => {
    expect([0, 8, 9, 10, 11, 12].map(baccaratCardValue)).toEqual([1, 9, 0, 0, 0, 0]);
    expect(baccaratValue([7, 8, 12])).toBe(7);
    expect(() => baccaratCardValue(52)).toThrow();
  });
  it.each([
    [0, [0,1,2,3,4,5,6,7,8,9]], [1, [0,1,2,3,4,5,6,7,8,9]], [2, [0,1,2,3,4,5,6,7,8,9]],
    [3, [0,1,2,3,4,5,6,7,9]], [4, [2,3,4,5,6,7]], [5, [4,5,6,7]], [6, [6,7]], [7, []],
  ])('uses the complete banker draw row at total %i', (score, allowed) => {
    for (let third = 0; third <= 9; third++) expect(bankerDraws(score, third)).toBe(allowed.includes(third));
    expect(bankerDraws(score, null)).toBe(score <= 5);
  });
  it('stops both hands on either natural 8 or 9', () => {
    const round = playBaccarat(100n, 'player', shoe(3, 0, 3, 1));
    expect(round.player).toEqual([3,3]); expect(round.banker).toEqual([0,1]);
    expect(round.winner).toBe('player'); expect(round.payout).toBe(200n);
    const bankNatural = playBaccarat(100n, 'banker', shoe(0, 3, 1, 4));
    expect(bankNatural.banker).toHaveLength(2); expect(bankNatural.player).toHaveLength(2);
    expect(bankNatural.winner).toBe('banker'); expect(bankNatural.payout).toBe(195n);
  });
  it('deals player, banker, player, banker, then mandatory third cards', () => {
    const round = playBaccarat(100n, 'player', shoe(0, 0, 1, 1, 7, 8));
    expect(round.player).toEqual([0,1,7]);
    // Banker on 3 stands when player drew 8.
    expect(round.banker).toEqual([0,1]);
    expect(round.winner).toBe('banker'); expect(round.payout).toBe(0n);
  });
  it('draws banker to five when player stands on six', () => {
    const round = playBaccarat(100n, 'banker', shoe(2, 1, 2, 2, 3));
    expect(round.player).toEqual([2,2]); expect(round.banker).toEqual([1,2,3]);
    expect(round.winner).toBe('banker');
  });
  it('returns player and banker stakes on a tie and pays tie at 8:1', () => {
    const player = [3,3], banker = [16,16];
    expect(evaluateBaccarat(player, banker, 100n, 'tie')).toEqual({winner:'tie',payout:900n,net:800n});
    for (const bet of ['player','banker'] as const) expect(evaluateBaccarat(player,banker,100n,bet)).toEqual({winner:'tie',payout:100n,net:0n});
  });
  it('pays huge banker wins exactly and rejects fractional commission stakes', () => {
    const stake = 20n * 10n ** 80n;
    expect(evaluateBaccarat([0,1],[3,4],stake,'banker').payout).toBe(stake*39n/20n);
    expect([0n,1n,19n,21n,100n].map(isBaccaratStake)).toEqual([false,false,false,false,true]);
    expect(() => playBaccarat(21n,'banker')).toThrow();
  });
  it('rejects impossible extra cards, missing third cards, and corrupt settlements', () => {
    expect(validBaccaratCards([3,3,0],[1,1])).toBe(false);
    expect(validBaccaratCards([0,1],[0,1])).toBe(false);
    const round = playBaccarat(100n,'player',shoe(3,0,3,1));
    expect(validBaccaratRound(round)).toBe(true);
    expect(validBaccaratRound({...round,payout:201n})).toBe(false);
    expect(validBaccaratRound({...round,net:101n})).toBe(false);
  });
  it('uses a fresh six-deck shoe with all 312 cards and preserves explicit input', () => {
    const shuffled = shuffledBaccaratShoe(); expect(shuffled).toHaveLength(312);
    for (let i = 0; i < 52; i++) expect(shuffled.filter(card => card === i)).toHaveLength(6);
    const deck = shoe(3,0,3,1), original = [...deck]; playBaccarat(100n,'player',deck); expect(deck).toEqual(original);
    expect(() => playBaccarat(100n,'player',deck.slice(1))).toThrow();
    deck[311]=deck[310]; expect(() => playBaccarat(100n,'player',deck)).toThrow();
  });
});
