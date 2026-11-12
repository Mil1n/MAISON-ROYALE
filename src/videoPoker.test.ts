import { describe,expect,it } from 'vitest';
import {drawVideoPoker,evaluateVideoPoker,startVideoPoker,validVideoPokerHand,validVideoPokerRound} from './videoPoker';
function deck(...first:number[]) {return [...first,...Array.from({length:52},(_,i)=>i).filter(i=>!first.includes(i))];}
describe('9/6 Jacks or Better',()=>{
 it.each([
  [[0,9,10,11,12],'royal',250],[[1,2,3,4,5],'straightFlush',50],[[0,13,26,39,8],'four',25],[[0,13,26,1,14],'full',9],[[0,2,4,6,8],'flush',6],[[0,14,28,42,4],'straight',4],[[9,23,37,51,0],'straight',4],[[0,13,26,2,5],'three',3],[[0,13,1,14,5],'twoPair',2],[[10,23,2,4,6],'jacksOrBetter',1],[[0,13,2,4,6],'jacksOrBetter',1],[[9,22,2,4,6],'loss',0],[[0,1,4,17,8],'loss',0],
 ] as const)('classifies %j as %s',(cards,category,multiplier)=>{expect(evaluateVideoPoker(cards,100n)).toEqual({category,payout:100n*BigInt(multiplier),net:100n*BigInt(multiplier)-100n});});
 it('does not allow a wrapped QKA23 straight',()=>{expect(evaluateVideoPoker([11,25,0,14,28],10n).category).toBe('loss');});
 it('holds selected positions and never draws discarded cards again',()=>{
  const hand=startVideoPoker(100n,deck(0,13,3,17,9)),copy=structuredClone(hand),round=drawVideoPoker(hand,[0,1]);
  expect(round.cards.slice(0,2)).toEqual([0,13]);expect(round.cards.slice(2).every(card=>!hand.cards.includes(card))).toBe(true);expect(hand).toEqual(copy);expect(validVideoPokerRound(round)).toBe(true);
 });
 it('supports discard-all and hold-all exactly once through the hand/round types',()=>{
  const hand=startVideoPoker(1n,deck(0,9,10,11,12));expect(drawVideoPoker(hand,[0,1,2,3,4]).payout).toBe(250n);expect(drawVideoPoker(hand,[]).cards.every(card=>!hand.cards.includes(card))).toBe(true);
 });
 it('rejects bad stakes, malformed decks, duplicate holds and invalid positions',()=>{
  expect(()=>startVideoPoker(0n)).toThrow();expect(()=>startVideoPoker(-1n)).toThrow();expect(()=>startVideoPoker(10n,deck().slice(1))).toThrow();expect(()=>startVideoPoker(10n,[...deck().slice(0,51),0])).toThrow();
  const hand=startVideoPoker(100n);for(const held of [[1,1],[5],[-1],[1.5]])expect(()=>drawVideoPoker(hand,held)).toThrow();
 });
 it('validates all 52 active cards, settlement values and retained card positions',()=>{
  const hand=startVideoPoker(100n),round=drawVideoPoker(hand,[0]);expect(validVideoPokerHand(hand)).toBe(true);expect(validVideoPokerHand({...hand,deck:[...hand.deck.slice(1),hand.cards[0]]})).toBe(false);expect(validVideoPokerRound({...round,payout:round.payout+1n})).toBe(false);expect(validVideoPokerRound({...round,held:[1]})).toBe(false);expect(validVideoPokerRound({...round,cards:[...round.initialCards]})).toBe(false);
 });
 it('keeps arbitrarily large payouts exact',()=>{const stake=10n**90n;expect(evaluateVideoPoker([0,9,10,11,12],stake).payout).toBe(250n*stake);});
});
