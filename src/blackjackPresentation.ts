import type { BJHand, BJRound, Card } from './blackjack';

export type BlackjackView = {
  id: string;
  player: Card[];
  dealer: (Card | null)[];
  dealerScoreCount: number;
  phase: 'empty' | 'dealing' | 'player' | 'dealer' | 'complete';
};
export type BlackjackPresentationStep = { at: number; view: BlackjackView };

/** Restored hands and history are shown immediately; only new actions are replayed. */
export function blackjackView(hand: BJHand | null, round: BJRound | null): BlackjackView {
  const source = hand ?? round;
  if (!source) return { id: 'empty', player: [], dealer: [], dealerScoreCount: 0, phase: 'empty' };
  return {
    id: source.id,
    player: [...source.player],
    dealer: hand ? [hand.dealer[0], null] : [...source.dealer],
    dealerScoreCount: hand ? 1 : source.dealer.length,
    phase: hand ? 'player' : 'complete',
  };
}

/** Presentation only: settlement and the saved deck remain in the game model. */
export function planBlackjackPresentation(previous: BlackjackView, hand: BJHand | null, round: BJRound | null, reducedMotion = false): BlackjackPresentationStep[] {
  const target = blackjackView(hand, round);
  if (reducedMotion || target.phase === 'empty') return [{ at: 0, view: target }];
  const source = hand ?? round!;
  const steps: BlackjackPresentationStep[] = [];
  let at = 0;
  let view: BlackjackView = { ...previous, player: [...previous.player], dealer: [...previous.dealer] };
  const step = (pause: number, patch: Partial<BlackjackView>) => {
    at += pause;
    view = { ...view, ...patch };
    steps.push({ at, view });
  };

  if (previous.id !== source.id) {
    step(0, { id: source.id, player: [], dealer: [], dealerScoreCount: 0, phase: 'dealing' });
    step(80, { player: source.player.slice(0, 1) });
    step(300, { dealer: [source.dealer[0]], dealerScoreCount: 1 });
    step(300, { player: source.player.slice(0, 2) });
    step(300, { dealer: [source.dealer[0], null] });
    // Let the last card reach the felt before accepting a player action.
    step(480, { phase: hand ? 'player' : 'dealer' });
  }

  for (let count = view.player.length + 1; count <= source.player.length; count++) {
    step(40, { player: source.player.slice(0, count), phase: 'dealing' });
    step(480, { phase: hand ? 'player' : 'dealer' });
  }
  if (hand) {
    step(0, { ...target });
    return steps;
  }

  // The score waits for the half-second flip, so it cannot reveal the hole early.
  step(180, { dealer: source.dealer.slice(0, 2), phase: 'dealer' });
  step(560, { dealerScoreCount: 2 });
  for (let count = 3; count <= source.dealer.length; count++) {
    step(180, { dealer: source.dealer.slice(0, count), dealerScoreCount: count });
    step(520, {});
  }
  step(420, { ...target });
  return steps;
}
