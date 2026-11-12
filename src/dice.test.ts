import { describe, expect, it, vi } from 'vitest';
import { randomDie, rollDice, startDice, validateDiceHand, validateDiceRound, type DicePair } from './dice';

describe('Pass Line craps',()=>{
 it.each<DicePair>([[1,6],[5,6]])('wins the come-out with %s + %s',(a,b)=>{
  const turn=startDice(101n,[a,b]);expect(turn.hand).toBeNull();expect(turn.round).toMatchObject({point:null,outcome:'win',payout:202n,net:101n});expect(validateDiceRound(turn.round)).toBe(true);
 });
 it.each<DicePair>([[1,1],[1,2],[6,6]])('loses come-out craps %s + %s',(a,b)=>{
  const turn=startDice(17n,[a,b]);expect(turn.round).toMatchObject({point:null,outcome:'loss',payout:0n,net:-17n});expect(validateDiceRound(turn.round)).toBe(true);
 });
 it.each<DicePair>([[1,3],[1,4],[1,5],[2,6],[3,6],[4,6]])('sets a point on %s + %s and pays only when repeated',(a,b)=>{
  const initial=startDice(23n,[a,b]);expect(initial.round).toBeNull();expect(initial.hand?.point).toBe(a+b);expect(validateDiceHand(initial.hand)).toBe(true);
  const finished=rollDice(initial.hand!,[b,a]);expect(finished.round).toMatchObject({point:a+b,outcome:'win',payout:46n,net:23n});expect(validateDiceRound(finished.round)).toBe(true);
 });
 it('keeps the same wager through neutral throws and loses only on seven-out',()=>{
  const first=startDice(100n,[2,2]).hand!;
  const second=rollDice(first,[1,1]).hand!;const third=rollDice(second,[6,6]).hand!;const fourth=rollDice(third,[5,6]).hand!;
  expect(fourth).toMatchObject({id:first.id,date:first.date,stake:100n,point:4,rolls:[[2,2],[1,1],[6,6],[5,6]]});
  expect(first.rolls).toEqual([[2,2]]);
  const last=rollDice(fourth,[3,4]).round!;expect(last).toMatchObject({outcome:'loss',payout:0n,net:-100n});expect(validateDiceRound(last)).toBe(true);
 });
 it('uses exact bigint payouts beyond Number precision',()=>{
  const stake=900719925474099312345n;expect(startDice(stake,[1,6]).round?.payout).toBe(stake*2n);
 });
 it('rejects invalid wagers, faces and forged active hands',()=>{
  expect(()=>startDice(0n,[1,6])).toThrow();expect(()=>startDice(-1n)).toThrow();expect(()=>startDice(1n,[0,7])).toThrow();
  const hand=startDice(10n,[2,2]).hand!;expect(()=>rollDice({...hand,point:5},[2,2])).toThrow();expect(validateDiceHand({...hand,rolls:[[1,6]]})).toBe(false);
 });
 it('replays imported results instead of trusting outcome, payout, point or terminal ordering',()=>{
  const hand=startDice(10n,[2,2]).hand!,win=rollDice(hand,[1,3]).round!;
  for(const patch of [{point:5},{payout:21n},{net:11n},{outcome:'loss'},{rolls:[[1,6],[1,3]]},{rolls:[[2,2],[3,4],[1,3]]},{rolls:[[2,2],[1,2.5]]},{stake:0n}])expect(validateDiceRound({...win,...patch})).toBe(false);
  expect(validateDiceRound({...win,rolls:[[2,2]]})).toBe(false);expect(validateDiceHand({...hand,date:'bad'})).toBe(false);
 });
 it('rejects out-of-range random words before mapping each of six faces',()=>{
  const values=[4294967295,4294967292,0,1,2,3,4,5];
  const spy=vi.spyOn(crypto,'getRandomValues').mockImplementation(((a:Uint32Array)=>{a[0]=values.shift()!;return a;}) as typeof crypto.getRandomValues);
  try{expect(Array.from({length:6},()=>randomDie())).toEqual([1,2,3,4,5,6]);expect(spy).toHaveBeenCalledTimes(8);}finally{spy.mockRestore();}
 });
});
