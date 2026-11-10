import { afterEach,describe,expect,it,vi } from 'vitest';
import { cardLabel,cardRank,cardSuit,doubleBlackjack,evaluateBlackjack,handValue,hitBlackjack,isBlackjackStake,shuffledDeck,standBlackjack,startBlackjack,validCard,type BJHand,type Card } from './blackjack';
afterEach(()=>vi.restoreAllMocks());
const deckWith=(...prefix:Card[])=>[...prefix,...Array.from({length:52},(_,i)=>i).filter(card=>!prefix.includes(card))];
const active=(...prefix:Card[]):BJHand=>{const result=startBlackjack(100n,deckWith(...prefix));expect(result.hand).not.toBeNull();return result.hand!;};

describe('cards and blackjack values',()=>{
 it('labels all ranks and suits consistently',()=>{expect(cardLabel(0)).toBe('A♠');expect(cardRank(9)).toBe('10');expect(cardRank(10)).toBe('J');expect(cardRank(11)).toBe('Q');expect(cardRank(12)).toBe('K');expect(cardSuit(13)).toBe('♥');expect(cardSuit(26)).toBe('♣');expect(cardLabel(51)).toBe('K♦');});
 it('accepts only standard card indices',()=>{expect(Array.from({length:52},(_,i)=>i).every(validCard)).toBe(true);for(const card of [-1,52,0.5,NaN,'0',null])expect(validCard(card)).toBe(false);expect(()=>handValue([52])).toThrow();});
 it('reduces aces only as needed and identifies soft hands',()=>{
  expect(handValue([0,13])).toEqual({total:12,soft:true,natural:false,bust:false});
  expect(handValue([0,13,9])).toEqual({total:12,soft:false,natural:false,bust:false});
  expect(handValue([0,5])).toEqual({total:17,soft:true,natural:false,bust:false});
  expect(handValue([0,13,26,6])).toEqual({total:20,soft:true,natural:false,bust:false});
 });
 it('distinguishes a two-card natural from a three-card 21 and bust',()=>{
  expect(handValue([0,9])).toEqual({total:21,soft:true,natural:true,bust:false});
  expect(handValue([0,4,17])).toEqual({total:21,soft:true,natural:false,bust:false});
  expect(handValue([9,22,1])).toEqual({total:22,soft:false,natural:false,bust:true});
 });
 it('requires even positive initial stakes so blackjack payouts have no rounding',()=>{for(const value of [2n,100n,9007199254740994n])expect(isBlackjackStake(value)).toBe(true);for(const value of [0n,-2n,1n,3n,2,'2'])expect(isBlackjackStake(value)).toBe(false);for(const value of [0n,-2n,3n])expect(()=>startBlackjack(value)).toThrow();});
});

describe('round outcomes and exact payouts',()=>{
 it('returns 3:2 profit plus the original stake for a natural, with huge exact amounts',()=>{
  const stake=9007199254740994n;
  expect(evaluateBlackjack([0,9],[8,21],stake)).toEqual({outcome:'blackjack',payout:22517998136852485n,net:13510798882111491n});
 });
 it('pushes matching naturals but dealer natural beats a non-natural player21',()=>{
  expect(evaluateBlackjack([0,9],[13,22],100n)).toEqual({outcome:'push',payout:100n,net:0n});
  expect(evaluateBlackjack([5,18,8],[0,9],100n)).toEqual({outcome:'loss',payout:0n,net:-100n});
 });
 it('settles wins, pushes and losses without capping the return',()=>{
  expect(evaluateBlackjack([9,22],[8,21],100n)).toEqual({outcome:'win',payout:200n,net:100n});
  expect(evaluateBlackjack([9,8],[22,21],100n)).toEqual({outcome:'push',payout:100n,net:0n});
  expect(evaluateBlackjack([7,20],[8,21],100n)).toEqual({outcome:'loss',payout:0n,net:-100n});
  expect(evaluateBlackjack([9,22],[8,21],10n**100n).payout).toBe(2n*10n**100n);
 });
 it('makes a player bust a loss even if the dealer also busted',()=>{expect(evaluateBlackjack([9,22,2],[8,21,4],100n).outcome).toBe('loss');});
 it('rejects duplicate cards and empty hands instead of evaluating a fabricated game',()=>{expect(()=>evaluateBlackjack([],[],100n)).toThrow();expect(()=>evaluateBlackjack([9,22],[9,21],100n)).toThrow();});
});

describe('single-deck actions',()=>{
 it('deals in player/dealer/player/dealer order without drawing on the player turn',()=>{
  const source=deckWith(4,8,5,7,2),original=[...source],result=startBlackjack(100n,source),hand=result.hand!;
  expect(result.round).toBeNull();expect(hand.player).toEqual([4,5]);expect(hand.dealer).toEqual([8,7]);expect(hand.deck).toHaveLength(48);expect(source).toEqual(original);
  const hit=hitBlackjack(hand);expect(hit.hand!.player).toEqual([4,5,2]);expect(hit.hand!.dealer).toEqual([8,7]);expect(hit.hand!.deck).toHaveLength(47);expect(hand.player).toEqual([4,5]);expect(hand.deck).toHaveLength(48);
 });
 it('settles both naturals immediately without drawing extra cards',()=>{
  const player=startBlackjack(100n,deckWith(0,8,9,7));expect(player.hand).toBeNull();expect(player.round!.outcome).toBe('blackjack');expect(player.round!.dealer).toEqual([8,7]);
  const dealer=startBlackjack(100n,deckWith(4,0,5,9));expect(dealer.hand).toBeNull();expect(dealer.round!.outcome).toBe('loss');expect(dealer.round!.player).toEqual([4,5]);
  const both=startBlackjack(100n,deckWith(0,13,9,22));expect(both.round!.outcome).toBe('push');
 });
 it('dealer stands on soft17 without taking the next card',()=>{
  const hand=active(9,0,7,5,22),round=standBlackjack(hand).round!;
  expect(round.dealer).toEqual([0,5]);expect(round.outcome).toBe('win');expect(hand.deck[0]).toBe(22);
 });
 it('dealer hits below17, adjusts an ace and stops at hard17',()=>{
  const hand=active(9,0,7,4,22,13),round=standBlackjack(hand).round!;
  expect(round.dealer).toEqual([0,4,22,13]);expect(handValue(round.dealer).total).toBe(17);expect(round.outcome).toBe('win');
 });
 it('auto-stands on player21 and plays the dealer to completion',()=>{
  const hand=active(9,8,4,5,18,1),result=hitBlackjack(hand);
  expect(result.hand).toBeNull();expect(handValue(result.round!.player).total).toBe(21);expect(result.round!.outcome).toBe('win');expect(result.round!.payout).toBe(200n);
 });
 it('ends a player bust immediately while leaving dealer on the original2cards',()=>{
  const hand=active(9,4,8,5,2),round=hitBlackjack(hand).round!;
  expect(round.player).toEqual([9,8,2]);expect(round.dealer).toEqual([4,5]);expect(round.outcome).toBe('loss');expect(round.net).toBe(-100n);
 });
 it('double takes exactly one player card and resolves with the total doubled stake',()=>{
  const hand=active(4,8,5,7,9,0),round=doubleBlackjack(hand).round!;
  expect(round.player).toEqual([4,5,9]);expect(round.dealer).toEqual([8,7]);expect(round.stake).toBe(200n);expect(round.doubled).toBe(true);expect(round.outcome).toBe('win');expect(round.payout).toBe(400n);expect(round.net).toBe(200n);expect(hand.stake).toBe(100n);
 });
 it('double bust loses the full doubled stake and never draws the dealer',()=>{
  const hand=active(9,4,8,5,2),round=doubleBlackjack(hand).round!;
  expect(round.stake).toBe(200n);expect(round.payout).toBe(0n);expect(round.net).toBe(-200n);expect(round.dealer).toEqual([4,5]);
 });
 it('disallows double after a hit or acting on an already-terminal hand',()=>{
  const hand=active(4,8,5,7,2),hit=hitBlackjack(hand).hand!;expect(()=>doubleBlackjack(hit)).toThrow();
  expect(()=>hitBlackjack({...hand,player:[0,9],deck:hand.deck})).toThrow();
  expect(()=>standBlackjack({...hand,deck:[]})).toThrow();
 });
 it('rejects incomplete, duplicate or invalid explicit decks without over-drawing',()=>{
  expect(()=>startBlackjack(100n,[])).toThrow();expect(()=>startBlackjack(100n,Array(52).fill(0))).toThrow();expect(()=>startBlackjack(100n,[...Array.from({length:51},(_,i)=>i),52])).toThrow();
 });
});

describe('secure shuffle',()=>{
 it('uses unbiased bounded crypto samples and preserves a full deck with no duplicate cards',()=>{
  let calls=0;vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint32Array)[0]=calls++===0?0xffffffff:0;return array;});
  const deck=shuffledDeck();expect([...deck].sort((a,b)=>a-b)).toEqual(Array.from({length:52},(_,i)=>i));expect(deck).not.toEqual(Array.from({length:52},(_,i)=>i));expect(calls).toBe(52);
 });
 it('starts a normal game from a fresh securely shuffled52-card permutation',()=>{
  vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint32Array)[0]=0;return array;});
  const result=startBlackjack(100n);const all=result.hand?[...result.hand.player,...result.hand.dealer,...result.hand.deck]:[...result.round!.player,...result.round!.dealer];
  expect(result.hand).not.toBeNull();expect(new Set(all).size).toBe(52);expect(result.hand!.deck).toHaveLength(48);
 });
});
