import { describe, expect, it } from 'vitest';
import type { BJHand, BJRound } from './blackjack';
import { blackjackView, planBlackjackPresentation } from './blackjackPresentation';

const hand: BJHand = { id: 'hand', date: '2026-01-01', stake: 100n, player: [9, 5], dealer: [3, 15], deck: [] };
const round: BJRound = { ...hand, dealer: [3, 15, 7, 21], outcome: 'win', payout: 200n, net: 100n, doubled: false };

describe('blackjack presentation', () => {
  it('deals player and dealer cards in order and never exposes an active hole card', () => {
    const steps = planBlackjackPresentation(blackjackView(null, null), hand, null);
    expect(steps.slice(0, 5).map(({ view }) => [view.player.length, view.dealer.length])).toEqual([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]]);
    expect(steps.every(({ view }) => view.dealer.length < 2 || view.dealer[1] === null)).toBe(true);
    expect(steps.at(-1)?.view.phase).toBe('player');
    expect(steps.at(-1)?.at).toBeGreaterThan(1400);
  });
  it('reveals the hole before drawing each dealer card and publishes the result last', () => {
    const previous = blackjackView(hand, null);
    const steps = planBlackjackPresentation(previous, null, round);
    const reveal = steps.find(({ view }) => view.dealer[1] === round.dealer[1])!;
    const score = steps.find(({ view }) => view.dealerScoreCount === 2)!;
    expect(score.at - reveal.at).toBeGreaterThanOrEqual(500);
    const third = steps.find(({ view }) => view.dealer.length === 3)!;
    const fourth = steps.find(({ view }) => view.dealer.length === 4)!;
    expect(third.at).toBeGreaterThan(score.at);
    expect(fourth.at - third.at).toBeGreaterThanOrEqual(500);
    expect(steps.slice(0, -1).every(({ view }) => view.phase !== 'complete')).toBe(true);
    expect(steps.at(-1)?.view).toEqual(blackjackView(null, round));
    expect(previous).toEqual(blackjackView(hand, null));
  });
  it('finishes the player hit animation before revealing the dealer', () => {
    const hitRound = { ...round, player: [...hand.player, 1] };
    const steps = planBlackjackPresentation(blackjackView(hand, null), null, hitRound);
    const hit = steps.find(({ view }) => view.player.length === 3)!;
    const reveal = steps.find(({ view }) => view.dealer[1] !== null)!;
    expect(reveal.at - hit.at).toBeGreaterThanOrEqual(480);
  });
  it('still sequences the initial cards when the deal immediately produces blackjack', () => {
    const natural = { ...round, player: [0, 10], dealer: [3, 15], outcome: 'blackjack' as const, payout: 250n, net: 150n };
    const steps = planBlackjackPresentation(blackjackView(null, null), null, natural);
    const hole = steps.find(({ view }) => view.dealer[1] === null)!;
    const reveal = steps.find(({ at, view }) => at > hole.at && view.dealer[1] === 15)!;
    expect(reveal.at).toBeGreaterThan(hole.at);
    expect(steps.at(-1)?.view.phase).toBe('complete');
  });
  it('scales every pause without changing card order or exposing the result early', () => {
    const previous = blackjackView(hand, null);
    const normal = planBlackjackPresentation(previous, null, round);
    for (const scale of [.5, 1.5, 2]) {
      const steps = planBlackjackPresentation(previous, null, round, false, scale);
      expect(steps.map(step => step.view)).toEqual(normal.map(step => step.view));
      steps.forEach((step, index) => expect(step.at).toBeCloseTo(normal[index].at * scale));
      const reveal = steps.find(({ view }) => view.dealer[1] === round.dealer[1])!;
      const score = steps.find(({ view }) => view.dealerScoreCount === 2)!;
      // The score remains hidden until the scaled physical flip has completed.
      expect(score.at - reveal.at).toBeGreaterThan(.52 * scale * 1000);
      expect(steps.slice(0, -1).every(({ view }) => view.phase !== 'complete')).toBe(true);
    }
  });
  it('restores a hand without exposing the hole and skips delays for reduced motion', () => {
    expect(blackjackView(hand, null).dealer).toEqual([3, null]);
    expect(planBlackjackPresentation(blackjackView(hand, null), null, round, true)).toEqual([{ at: 0, view: blackjackView(null, round) }]);
  });
});
