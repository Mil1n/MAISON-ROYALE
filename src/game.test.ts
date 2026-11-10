import { describe,it,expect,vi,afterEach } from 'vitest';
import { color, WHEEL, wins, payout, nextRotation, randomNumber, validPocket, validId, total, money, parseMoneyInput } from './game';
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
  const bets=[{id:'n:0',amount:10n},{id:'n:00',amount:100n},{id:'red',amount:50n}];
  expect(payout(bets,0)).toBe(360n);expect(payout(bets,'00')).toBe(3600n);
 });
 it('returns stake plus standard profit',()=>{expect(payout([{id:'n:17',amount:100n}],17)).toBe(3600n);expect(payout([{id:'red',amount:100n}],3)).toBe(200n);expect(payout([{id:'dozen:2',amount:100n}],17)).toBe(300n);expect(payout([{id:'col:3',amount:100n}],36)).toBe(300n);});
 it('settles multiple simultaneous bets independently',()=>{expect(payout([{id:'n:3',amount:10n},{id:'red',amount:50n},{id:'even',amount:100n},{id:'col:3',amount:10n}],3)).toBe(490n);});
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
describe('exact money without a business balance cap',()=>{
 it('keeps a one-unit difference beyond Number.MAX_SAFE_INTEGER',()=>{
  expect(total([{id:'n:0',amount:9007199254740992n},{id:'n:00',amount:1n}])).toBe(9007199254740993n);
 });
 it('settles a straight winning stake above Number.MAX_SAFE_INTEGER exactly',()=>{
  expect(payout([{id:'n:00',amount:9007199254740993n}],'00')).toBe(324259173170675748n);
 });
 it('allows a winning result above the former one-billion cap',()=>{
  const oldBalance=1000000000n,stake=100n;
  expect(oldBalance-stake+payout([{id:'n:17',amount:stake}],17)).toBe(1000003500n);
 });
 it('does not replace the old cap with another numeric ceiling',()=>{
  const amount=10n**100n;
  expect(payout([{id:'n:0',amount}],0)).toBe(BigInt('36'+'0'.repeat(100)));
  expect(payout([{id:'n:0',amount}],'00')).toBe(0n);
 });
 it('returns exact zero for empty and losing bets',()=>{
  expect(total([])).toBe(0n);expect(payout([],0)).toBe(0n);expect(payout([{id:'red',amount:9007199254740993n}],2)).toBe(0n);
 });
 it('formats huge positive and negative balances without scientific notation or rounding',()=>{
  expect(money(9007199254740993n).replace(/\s/g,'')).toBe('9007199254740993');
  expect(money(-9007199254740993n).replace(/\s/g,'')).toBe('-9007199254740993');
  expect(money(10n**100n).replace(/\s/g,'')).toBe('1'+'0'.repeat(100));
 });
 it('still formats numeric counters',()=>{expect(money(12345).replace(/\s/g,'')).toBe('12345');});
});
describe('money input',()=>{
 it('parses arbitrarily large decimal input without passing through Number',()=>{expect(parseMoneyInput('9007199254740993')).toBe(9007199254740993n);expect(parseMoneyInput('1'+'0'.repeat(100))).toBe(10n**100n);});
 it('accepts grouping spaces and leaves zero positivity checks to the caller',()=>{
  expect(parseMoneyInput(' 1 234\u00a0567\u202f890 ')).toBe(1234567890n);
  expect(parseMoneyInput('0')).toBe(0n);expect(parseMoneyInput('000123')).toBe(123n);
 });
 it.each(['','   ','-1','+1','1.5','1,5','1e3','0x10','Infinity','NaN','123фишки'])('rejects non-integer decimal input: %s',value=>{expect(parseMoneyInput(value)).toBeNull();});
});
