import { describe,it,expect,vi } from 'vitest';
import { color, WHEEL, wins, payout, nextRotation, randomNumber } from './game';
import { initial, parseSave, recover } from './storage';
describe('European roulette',()=>{
 it('has exactly 37 pockets and correct colour balance',()=>{expect([...WHEEL].sort((a,b)=>a-b)).toEqual(Array.from({length:37},(_,i)=>i));expect(WHEEL.filter(n=>color(n)==='red')).toHaveLength(18);expect(WHEEL.filter(n=>color(n)==='black')).toHaveLength(18);});
 it('zero loses all outside bets',()=>{for(const id of ['red','black','even','odd','low','high','dozen:1','dozen:2','dozen:3','col:1','col:2','col:3'])expect(wins(id,0)).toBe(false);expect(wins('n:0',0)).toBe(true);});
 it('returns stake plus standard profit',()=>{expect(payout([{id:'n:17',amount:100}],17)).toBe(3600);expect(payout([{id:'red',amount:100}],3)).toBe(200);expect(payout([{id:'dozen:2',amount:100}],17)).toBe(300);expect(payout([{id:'col:3',amount:100}],36)).toBe(300);});
 it('settles multiple simultaneous bets independently',()=>{expect(payout([{id:'n:3',amount:10},{id:'red',amount:50},{id:'even',amount:100},{id:'col:3',amount:10}],3)).toBe(490);});
 it('partitions nonzero numbers into exact outside groups',()=>{for(let n=1;n<=36;n++){expect(['red','black'].filter(id=>wins(id,n))).toHaveLength(1);expect(['even','odd'].filter(id=>wins(id,n))).toHaveLength(1);expect(['low','high'].filter(id=>wins(id,n))).toHaveLength(1);expect([1,2,3].filter(i=>wins(`dozen:${i}`,n))).toHaveLength(1);expect([1,2,3].filter(i=>wins(`col:${i}`,n))).toHaveLength(1);}});
 it('stops every pocket at the fixed pointer, including repeated spins',()=>{let angle=0;for(const n of [...WHEEL,...WHEEL]){const next=nextRotation(angle,n);expect(next-angle).toBeGreaterThanOrEqual(2160);expect((next+WHEEL.indexOf(n)*360/37)%360).toBeCloseTo(0,6);angle=next;}});
 it('rejects random samples above unbiased range',()=>{let calls=0;const spy=vi.spyOn(crypto,'getRandomValues').mockImplementation((arr)=>{(arr as Uint32Array)[0]=calls++===0?0xffffffff:36;return arr;});expect(randomNumber()).toBe(36);expect(calls).toBe(2);spy.mockRestore();});
});
describe('saved data',()=>{
 it('round trips a valid save',()=>{const s=initial();s.bets=[{id:'n:0',amount:100}];s.balance-=100;expect(parseSave(JSON.stringify(s))).toEqual(s);});
 it.each(['{}','null','not json',JSON.stringify({...initial(),balance:-1}),JSON.stringify({...initial(),bets:[{id:'n:99',amount:10}]}),JSON.stringify({...initial(),bets:[{id:'red',amount:1.2}]})])('rejects damaged saves: %s',raw=>{expect(()=>parseSave(raw)).toThrow();});
 it('settles interrupted spins exactly once',()=>{const s=initial();s.balance=9900;s.pending={id:'test',date:new Date().toISOString(),number:0,bets:[{id:'n:0',amount:100}],stake:100,payout:3600,net:3500};const restored=recover(parseSave(JSON.stringify(s)));expect(restored.balance).toBe(13500);expect(restored.rounds).toHaveLength(1);expect(recover(restored)).toEqual(restored);});
 it('rejects fabricated payouts',()=>{const s=initial();s.rounds=[{id:'bad',date:new Date().toISOString(),number:0,bets:[{id:'red',amount:100}],stake:100,payout:200,net:100}];expect(()=>parseSave(JSON.stringify(s))).toThrow();});
});
