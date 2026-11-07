import { describe,it,expect,vi,afterEach } from 'vitest';
import { color, WHEEL, wins, payout, nextRotation, randomNumber, validPocket, validId, canSettle, MAX_MONEY } from './game';
import { initial, parseSave, recover } from './storage';
afterEach(()=>vi.restoreAllMocks());
describe('American roulette',()=>{
 it('has the canonical 38-pocket order and correct colour balance',()=>{
  expect(WHEEL).toEqual([0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,'00',27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2]);
  expect(new Set(WHEEL).size).toBe(38);
  expect(WHEEL.filter(n=>color(n)==='red')).toHaveLength(18);
  expect(WHEEL.filter(n=>color(n)==='black')).toHaveLength(18);
  expect(WHEEL.filter(n=>color(n)==='green')).toEqual([0,'00']);
 });
 it.each([0,'00'] as const)('zero %s loses all outside bets',n=>{for(const id of ['red','black','even','odd','low','high','dozen:1','dozen:2','dozen:3','col:1','col:2','col:3'])expect(wins(id,n)).toBe(false);expect(wins(`n:${n}`,n)).toBe(true);});
 it('distinguishes zero and double zero in straight bets and payouts',()=>{
  expect(wins('n:0','00')).toBe(false);expect(wins('n:00',0)).toBe(false);
  const bets=[{id:'n:0',amount:10},{id:'n:00',amount:100},{id:'red',amount:50}];
  expect(payout(bets,0)).toBe(360);expect(payout(bets,'00')).toBe(3600);
 });
 it('returns stake plus standard profit',()=>{expect(payout([{id:'n:17',amount:100}],17)).toBe(3600);expect(payout([{id:'red',amount:100}],3)).toBe(200);expect(payout([{id:'dozen:2',amount:100}],17)).toBe(300);expect(payout([{id:'col:3',amount:100}],36)).toBe(300);});
 it('settles multiple simultaneous bets independently',()=>{expect(payout([{id:'n:3',amount:10},{id:'red',amount:50},{id:'even',amount:100},{id:'col:3',amount:10}],3)).toBe(490);});
 it('partitions nonzero numbers into exact outside groups',()=>{for(let n=1;n<=36;n++){expect(['red','black'].filter(id=>wins(id,n))).toHaveLength(1);expect(['even','odd'].filter(id=>wins(id,n))).toHaveLength(1);expect(['low','high'].filter(id=>wins(id,n))).toHaveLength(1);expect([1,2,3].filter(i=>wins(`dozen:${i}`,n))).toHaveLength(1);expect([1,2,3].filter(i=>wins(`col:${i}`,n))).toHaveLength(1);}});
 it('stops every pocket at the fixed pointer, including repeated spins',()=>{let angle=0;for(const n of [...WHEEL,...WHEEL]){const next=nextRotation(angle,n);expect(next-angle).toBeGreaterThanOrEqual(2160);const rem=(next+WHEEL.indexOf(n)*360/WHEEL.length)%360;expect(Math.min(rem,360-rem)).toBeCloseTo(0,6);angle=next;}});
 it('rejects biased random samples before generating double zero',()=>{let calls=0;vi.spyOn(crypto,'getRandomValues').mockImplementation((arr)=>{(arr as Uint32Array)[0]=calls++===0?0xffffffff:19;return arr;});expect(randomNumber()).toBe('00');expect(calls).toBe(2);});
 it('can generate each pocket by unbiased index',()=>{let i=0;vi.spyOn(crypto,'getRandomValues').mockImplementation(arr=>{(arr as Uint32Array)[0]=i++;return arr;});expect(WHEEL.map(()=>randomNumber())).toEqual(WHEEL);});
 it('validates numbers and canonical betting identifiers',()=>{
  for(const n of WHEEL){expect(validPocket(n)).toBe(true);expect(validId(`n:${n}`)).toBe(true);}
  for(const n of [-1,37,0.1,NaN,Infinity,'0','000',null,{}])expect(validPocket(n)).toBe(false);
  for(const id of ['n:01','n:000','n:37','n:-1'])expect(validId(id)).toBe(false);
 });
});
describe('saved data',()=>{
 it('round trips a valid save with double-zero bets and disabled auto spin',()=>{const s=initial();s.bets=[{id:'n:00',amount:100}];s.balance-=100;s.autoSpin=false;expect(parseSave(JSON.stringify(s))).toEqual(s);});
 it('reads an old v1 save without the new setting',()=>{const {autoSpin:_,...legacy}=initial();legacy.bets=[{id:'n:0',amount:100}];legacy.balance=9900;const parsed=parseSave(JSON.stringify(legacy));expect(parsed).toEqual({...legacy,autoSpin:true});});
 it.each(['{}','null','not json',JSON.stringify({...initial(),balance:-1}),JSON.stringify({...initial(),bets:[{id:'n:99',amount:10}]}),JSON.stringify({...initial(),bets:[{id:'red',amount:1.2}]}),JSON.stringify({...initial(),autoSpin:'yes'}),JSON.stringify({...initial(),autoSpin:null})])('rejects damaged saves: %s',raw=>{expect(()=>parseSave(raw)).toThrow();});
 it('settles an old interrupted zero spin exactly once without changing its result',()=>{const {autoSpin:_,...legacy}=initial();const pending={id:'test',date:new Date().toISOString(),number:0,bets:[{id:'n:0',amount:100}],stake:100,payout:3600,net:3500};const restored=recover(parseSave(JSON.stringify({...legacy,balance:9900,pending})));expect(restored.balance).toBe(13500);expect(restored.rounds).toEqual([pending]);expect(recover(restored)).toEqual(restored);});
 it('settles an interrupted double-zero spin exactly once',()=>{const s=initial();s.balance=9900;s.pending={id:'double-zero',date:new Date().toISOString(),number:'00',bets:[{id:'n:00',amount:100}],stake:100,payout:3600,net:3500};const restored=recover(parseSave(JSON.stringify(s)));expect(restored.balance).toBe(13500);expect(restored.rounds[0].number).toBe('00');expect(recover(restored)).toEqual(restored);});
 it.each([37,'0','000',-1,0.5])('rejects invalid result %s',number=>{const s=initial();const bad={id:'bad',date:new Date().toISOString(),number,bets:[{id:'red',amount:100}],stake:100,payout:0,net:-100};expect(()=>parseSave(JSON.stringify({...s,rounds:[bad]}))).toThrow();});
 it('rejects fabricated payouts, including confusing 0 with 00',()=>{const s=initial();s.rounds=[{id:'bad',date:new Date().toISOString(),number:'00',bets:[{id:'n:0',amount:100}],stake:100,payout:3600,net:3500}];expect(()=>parseSave(JSON.stringify(s))).toThrow();});
});

describe('settlement preflight',()=>{
 it('checks zero and double-zero returns independently rather than adding mutually exclusive wins',()=>{
  const bets=[{id:'n:0',amount:10},{id:'n:00',amount:100}];
  expect(canSettle(MAX_MONEY-3600,bets)).toBe(true);
  expect(canSettle(MAX_MONEY-3599,bets)).toBe(false);
 });
 it('accepts a maximum payout exactly at the balance cap',()=>{
  expect(canSettle(MAX_MONEY-36000,[{id:'n:17',amount:1000}])).toBe(true);
 });
 it('rejects a maximum payout one unit above the balance cap',()=>{
  expect(canSettle(MAX_MONEY-35999,[{id:'n:17',amount:1000}])).toBe(false);
 });
 it('accepts modest simultaneous bets with overlapping wins',()=>{
  expect(canSettle(10000,[{id:'n:17',amount:100},{id:'black',amount:200},{id:'dozen:2',amount:50}])).toBe(true);
 });
 it('rejects a high straight bet even when losing outcomes would fit',()=>{
  expect(canSettle(0,[{id:'n:17',amount:30000000}])).toBe(false);
  expect(canSettle(0,[{id:'n:00',amount:30000000}])).toBe(false);
 });
 it('accounts for the full all-in return on even-money bets',()=>{
  expect(canSettle(0,[{id:'red',amount:500000000}])).toBe(true);
  expect(canSettle(0,[{id:'red',amount:500000001}])).toBe(false);
 });
 it('preflights without consuming any random draw',()=>{
  const spy=vi.spyOn(crypto,'getRandomValues');
  canSettle(0,[{id:'n:00',amount:30000000}]);
  expect(spy).not.toHaveBeenCalled();
 });
 it('rejects invalid unreserved balances',()=>{
  for(const balance of [-1,0.5,NaN,Infinity,MAX_MONEY+1])expect(canSettle(balance,[])).toBe(false);
 });
});
