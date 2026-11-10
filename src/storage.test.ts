import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Bet, type Round } from './game';
import { initial, KEY, load, parseSave, persist, recover, stringifySave } from './storage';

const date='2026-11-10T12:00:00.000Z';
const legacy=()=>({version:1,balance:10000,bets:[],lastBets:[],rounds:[],sound:true,pending:null});
const wire=()=>JSON.parse(stringifySave(initial()));
const won=(id='win',stake=100n):Round=>({id,date,number:'00',bets:[{id:'n:00',amount:stake}],stake,payout:stake*36n,net:stake*35n});
const lost=(id='loss',stake=100n):Round=>({id,date,number:'00',bets:[{id:'n:0',amount:stake}],stake,payout:0n,net:-stake});
const legacyWon=(id='legacy-win')=>({id,date,number:0,bets:[{id:'n:0',amount:1000000000}],stake:1000000000,payout:36000000000,net:35000000000});
afterEach(()=>vi.unstubAllGlobals());

describe('exact save serialization',()=>{
 it('starts a version 3 save with a bigint balance under the existing storage key',()=>{
  expect(initial()).toEqual({version:3,activeGame:'roulette',blackjack:{hand:null,rounds:[]},balance:10000n,bets:[],lastBets:[],rounds:[],sound:true,autoSpin:true,pending:null});
  expect(KEY).toBe('maison-royale-v1');
 });
 it('round trips balances, bets, history and signed results far above Number.MAX_SAFE_INTEGER',()=>{
  const huge=12345678901234567890123456789012345678901234567890n;
  const save={...initial(),balance:huge,bets:[{id:'red',amount:huge}],lastBets:[{id:'n:00',amount:huge}],rounds:[won('huge-win',huge),lost('huge-loss',huge)],autoSpin:false};
  const serialized=stringifySave(save,2),json=JSON.parse(serialized);
  expect(json.version).toBe(3);
  expect(json.balance).toBe(huge.toString());
  expect(json.rounds[1].net).toBe((-huge).toString());
  expect(serialized).toContain('\n  "version": 3');
  expect(parseSave(serialized)).toEqual(save);
 });
 it('credits an unlimited interrupted double-zero payout exactly once',()=>{
  const huge=10n**80n+1n;
  const save={...initial(),balance:huge,pending:won('pending',huge)};
  const restored=recover(parseSave(stringifySave(save)));
  expect(restored.balance).toBe(huge*37n);
  expect(restored.pending).toBeNull();
  expect(restored.rounds).toEqual([won('pending',huge)]);
  expect(recover(restored)).toBe(restored);
  expect(recover(parseSave(stringifySave(restored)))).toEqual(restored);
 });
 it('distinguishes zero and double-zero when validating stored results',()=>{
  const save={...initial(),rounds:[lost()]};
  expect(parseSave(stringifySave(save)).rounds[0].payout).toBe(0n);
  const forged=JSON.parse(stringifySave({...initial(),rounds:[won()]}));
  forged.rounds[0].number=0;
  expect(()=>parseSave(JSON.stringify(forged))).toThrow();
 });
 it('validates positive and zero signed net values alongside losses',()=>{
  const bets:Bet[]=[{id:'red',amount:100n},{id:'black',amount:100n}];
  const push:Round={id:'push',date,number:1,bets,stake:200n,payout:200n,net:0n};
  const save={...initial(),rounds:[won(),lost(),push]};
  expect(parseSave(stringifySave(save))).toEqual(save);
 });
});

describe('version 1 migration',()=>{
 it('preserves a one-billion balance, numeric history and legacy pending without a payout cap',()=>{
  const history=legacyWon('history'),pending=legacyWon('pending');
  const parsed=parseSave(JSON.stringify({...legacy(),balance:1000000000,lastBets:pending.bets,rounds:[history],pending}));
  expect(parsed.version).toBe(3);
  expect(parsed.autoSpin).toBe(true);
  expect(parsed.balance).toBe(1000000000n);
  expect(parsed.rounds[0]).toEqual({...history,bets:[{id:'n:0',amount:1000000000n}],stake:1000000000n,payout:36000000000n,net:35000000000n});
  const restored=recover(parsed);
  expect(restored.balance).toBe(37000000000n);
  expect(restored.rounds.map(r=>r.id)).toEqual(['pending','history']);
  expect(recover(restored)).toBe(restored);
  expect(parseSave(stringifySave(restored))).toEqual(restored);
 });
 it('preserves disabled auto spin, existing bets and a negative historical net',()=>{
  const entry={id:'loss',date,number:'00',bets:[{id:'n:0',amount:50}],stake:50,payout:0,net:-50};
  const migrated=parseSave(JSON.stringify({...legacy(),balance:9950,bets:[{id:'red',amount:50}],rounds:[entry],autoSpin:false}));
  expect(migrated.balance).toBe(9950n);
  expect(migrated.bets).toEqual([{id:'red',amount:50n}]);
  expect(migrated.rounds[0].net).toBe(-50n);
  expect(migrated.autoSpin).toBe(false);
 });
 it.each([Number.MAX_SAFE_INTEGER+1,1.5,-1])('rejects a legacy balance that cannot be migrated safely: %s',balance=>{
  expect(()=>parseSave(JSON.stringify({...legacy(),balance}))).toThrow();
 });
 it('rejects unsafe nested numeric money even when the top-level balance is safe',()=>{
  for(const field of ['stake','payout','net']){
   const entry={...legacyWon(),[field]:Number.MAX_SAFE_INTEGER+1};
   expect(()=>parseSave(JSON.stringify({...legacy(),rounds:[entry]}))).toThrow();
  }
  expect(()=>parseSave(JSON.stringify({...legacy(),lastBets:[{id:'red',amount:Number.MAX_SAFE_INTEGER+1}]}))).toThrow();
 });
});

describe('save validation',()=>{
 it.each(['{}','null','[]','invalid JSON','{"version":3}'])('rejects invalid top-level data: %s',raw=>{
  expect(()=>parseSave(raw)).toThrow();
 });
 it.each(['','01','00','-0','+1','-1','1e6','1.0','0.1',' 1','1 ',1,null,true])('rejects noncanonical current balance %s',balance=>{
  expect(()=>parseSave(JSON.stringify({...wire(),balance}))).toThrow();
 });
 it.each(['-0','+100','01','-01','1e3','1.5',100])('rejects noncanonical current signed net %s',net=>{
  const source=JSON.parse(stringifySave({...initial(),rounds:[won()]}));
  source.rounds[0].net=net;
  expect(()=>parseSave(JSON.stringify(source))).toThrow();
 });
 it('rejects malformed ids and nonpositive stakes in current or previous bets',()=>{
  for(const field of ['bets','lastBets'])for(const bet of [{id:'n:37',amount:'1'},{id:'n:000',amount:'1'},{id:'red',amount:'0'},{id:'red',amount:'-1'},{id:'red',amount:1},null]){
   expect(()=>parseSave(JSON.stringify({...wire(),[field]:[bet]}))).toThrow();
  }
 });
 it('enforces the 2000-bet and 10000-round bounds',()=>{
  expect(()=>parseSave(JSON.stringify({...wire(),bets:Array(2001).fill({id:'red',amount:'1'})}))).toThrow();
  expect(()=>parseSave(JSON.stringify({...wire(),lastBets:Array(2001).fill({id:'red',amount:'1'})}))).toThrow();
  const entry=JSON.parse(stringifySave({...initial(),rounds:[won()]})).rounds[0];
  expect(()=>parseSave(JSON.stringify({...wire(),rounds:Array.from({length:10001},(_,i)=>({...entry,id:String(i)}))}))).toThrow();
 });
 it('rejects bad settings, missing required values, unknown pockets, invalid dates and duplicate round ids',()=>{
  for(const setting of [null,1,'true'])expect(()=>parseSave(JSON.stringify({...wire(),autoSpin:setting}))).toThrow();
  const missing=wire();delete missing.autoSpin;expect(()=>parseSave(JSON.stringify(missing))).toThrow();
  const source=JSON.parse(stringifySave({...initial(),rounds:[won()]}));
  for(const number of [37,-1,'0','000',1.5])expect(()=>parseSave(JSON.stringify({...source,rounds:[{...source.rounds[0],number}]}))).toThrow();
  expect(()=>parseSave(JSON.stringify({...source,rounds:[{...source.rounds[0],date:'not a date'}]}))).toThrow();
  expect(()=>parseSave(JSON.stringify({...source,rounds:[source.rounds[0],source.rounds[0]]}))).toThrow();
  const missingPending=wire();delete missingPending.pending;expect(()=>parseSave(JSON.stringify(missingPending))).toThrow();
 });
 it('rejects inconsistent exact stake, payout and net calculations',()=>{
  const source=JSON.parse(stringifySave({...initial(),rounds:[won()]}));
  for(const [field,value] of [['stake','101'],['payout','3601'],['net','3501']])expect(()=>parseSave(JSON.stringify({...source,rounds:[{...source.rounds[0],[field]:value}]}))).toThrow();
  expect(()=>parseSave(JSON.stringify({...source,rounds:[{...source.rounds[0],bets:[],stake:'0',payout:'0',net:'0'}]}))).toThrow();
 });
 it('rejects a pending round already settled or accompanied by unreserved current bets',()=>{
  expect(()=>parseSave(stringifySave({...initial(),rounds:[won()],pending:won()}))).toThrow();
  expect(()=>parseSave(stringifySave({...initial(),bets:[{id:'red',amount:1n}],pending:won()}))).toThrow();
 });
 it('caps retained history at 10000 only by count, preserving the full pending credit',()=>{
  const save={...initial(),rounds:Array.from({length:10000},(_,i)=>lost(String(i))),pending:won('pending',10n**50n)};
  const restored=recover(save);
  expect(restored.rounds).toHaveLength(10000);
  expect(restored.rounds[0].id).toBe('pending');
  expect(restored.balance).toBe(10000n+36n*10n**50n);
 });
});

describe('browser persistence',()=>{
 it('persists exact decimal strings and reads them without numeric rounding',()=>{
  const values=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  const save={...initial(),balance:10n**100n+123n};
  expect(persist(save)).toBe(true);
  expect(JSON.parse(values.get(KEY)!).balance).toBe(save.balance.toString());
  expect(load()).toEqual({save,warning:''});
 });
 it('keeps damaged source data intact when loading a fallback save',()=>{
  const setItem=vi.fn();vi.stubGlobal('localStorage',{getItem:()=>'{broken',setItem});
  const result=load();expect(result.save).toEqual(initial());expect(result.warning).not.toBe('');expect(setItem).not.toHaveBeenCalled();
 });
 it('reports a storage write failure without throwing',()=>{
  vi.stubGlobal('localStorage',{setItem:()=>{throw new Error('quota exceeded');}});
  expect(persist(initial())).toBe(false);
 });
});

// Blackjack shares the wallet but retains an active hand without settling it.
// Card ranks use card % 13 (0 = ace); all fixtures use one physical 52-card deck.
function activeBlackjack(stake=100n,player=[9,6],dealer=[8,5]) {
 const dealt=new Set([...player,...dealer]);
 return {id:'active-bj',date,stake,player,dealer,deck:Array.from({length:52},(_,i)=>i).filter(card=>!dealt.has(card))};
}
function blackjackResult(id='bj-win',stake=100n) {
 return {id,date,stake,player:[9,11],dealer:[8,7],outcome:'win' as const,payout:stake*2n,net:stake,doubled:false};
}
function blackjackNatural(id='bj-natural',stake=100n) {
 return {id,date,stake,player:[0,12],dealer:[9,7],outcome:'blackjack' as const,payout:stake*5n/2n,net:stake*3n/2n,doubled:false};
}
function blackjackWire() {
 return JSON.parse(stringifySave({...initial(),activeGame:'blackjack',blackjack:{hand:activeBlackjack(),rounds:[]}}));
}

describe('shared blackjack saves and migration',()=>{
 it('migrates a v2 wallet, roulette history, bets and settings without changing their exact values',()=>{
  const huge=10n**100n+7n;
  const save={...initial(),balance:huge,bets:[{id:'black',amount:huge}],lastBets:[{id:'n:00',amount:200n}],rounds:[won('roulette-history',huge)],autoSpin:false};
  const old=JSON.parse(stringifySave(save));old.version=2;delete old.blackjack;delete old.activeGame;
  expect(parseSave(JSON.stringify(old))).toEqual(save);
 });
 it('migrates an old v2 pending roulette result with the full payout and empty blackjack state',()=>{
  const huge=10n**80n;
  const old=JSON.parse(stringifySave({...initial(),balance:huge,pending:won('pending',huge)}));old.version=2;delete old.blackjack;delete old.activeGame;
  const restored=recover(parseSave(JSON.stringify(old)));
  expect(restored.version).toBe(3);
  expect(restored.activeGame).toBe('roulette');
  expect(restored.blackjack).toEqual({hand:null,rounds:[]});
  expect(restored.balance).toBe(huge*37n);
 });
 it('preserves an active unlimited blackjack stake, exact deck order and reserved balance through repeated reloads',()=>{
  const huge=10n**120n;
  const hand=activeBlackjack(huge,[9,6,1],[8,5]);
  const save={...initial(),balance:huge+1n,activeGame:'blackjack' as const,blackjack:{hand,rounds:[blackjackNatural('past',huge)]}};
  const parsed=parseSave(stringifySave(save));
  expect(parsed).toEqual(save);
  expect(recover(parsed)).toBe(parsed);
  const again=recover(parseSave(stringifySave(recover(parsed))));
  expect(again.balance).toBe(huge+1n);
  expect(again.blackjack.hand).toEqual(hand);
  expect(again.blackjack.rounds).toHaveLength(1);
 });
 it('routes a restored unfinished hand to blackjack rather than hiding it on the roulette screen',()=>{
  const source=blackjackWire();source.activeGame='roulette';
  const restored=parseSave(JSON.stringify(source));
  expect(restored.activeGame).toBe('blackjack');
  expect(restored.blackjack.hand?.id).toBe('active-bj');
 });
 it('does not re-credit historical blackjack returns during recovery',()=>{
  const huge=10n**60n;
  const save={...initial(),balance:huge,blackjack:{hand:null,rounds:[blackjackNatural('already-paid',huge)]}};
  expect(recover(parseSave(stringifySave(save)))).toEqual(save);
 });
 it('round trips exact natural, normal, doubled, losing and push historical payouts',()=>{
  const huge=10n**80n;
  const doubled={id:'doubled',date,stake:huge*2n,player:[5,4,9],dealer:[8,7],outcome:'win' as const,payout:huge*4n,net:huge*2n,doubled:true};
  const loss={id:'bj-loss',date,stake:huge,player:[9,6],dealer:[8,10],outcome:'loss' as const,payout:0n,net:-huge,doubled:false};
  const push={id:'bj-push',date,stake:huge,player:[9,7],dealer:[8,21],outcome:'push' as const,payout:huge,net:0n,doubled:false};
  const save={...initial(),blackjack:{hand:null,rounds:[blackjackNatural('natural',huge),blackjackResult('normal',huge),doubled,loss,push]}};
  const serialized=stringifySave(save),json=JSON.parse(serialized);
  expect(json.blackjack.rounds[0].payout).toBe((huge*5n/2n).toString());
  expect(parseSave(serialized)).toEqual(save);
 });
 it('persists and loads an active hand without refunding or settling its already reserved stake',()=>{
  const values=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  const save={...initial(),balance:9000n,activeGame:'blackjack' as const,blackjack:{hand:activeBlackjack(1000n),rounds:[]}};
  expect(persist(save)).toBe(true);
  expect(load()).toEqual({save,warning:''});
  expect(load()).toEqual({save,warning:''});
  expect(values.get(KEY)).toBe(stringifySave(save));
 });
});

describe('blackjack save validation',()=>{
 it.each([null,{},'roulette',[],{hand:null},{rounds:[]}])('requires complete blackjack state in version 3: %j',blackjack=>{
  expect(()=>parseSave(JSON.stringify({...wire(),blackjack}))).toThrow();
 });
 it('requires a known active game in version 3',()=>{
  for(const activeGame of [undefined,null,'poker',1])expect(()=>parseSave(JSON.stringify({...wire(),activeGame}))).toThrow();
 });
 it('requires a complete nonduplicated 52-card partition for active hands',()=>{
  const source=blackjackWire();
  for(const mutate of [
   (hand:ReturnType<typeof activeBlackjack>)=>{hand.deck[0]=hand.player[0];},
   (hand:ReturnType<typeof activeBlackjack>)=>{hand.deck.pop();},
   (hand:ReturnType<typeof activeBlackjack>)=>{hand.player[1]=hand.player[0];},
   (hand:ReturnType<typeof activeBlackjack>)=>{hand.dealer[0]=hand.player[0];},
   (hand:ReturnType<typeof activeBlackjack>)=>{hand.dealer.push(hand.deck.pop()!);},
  ]){
   const copy=structuredClone(source);mutate(copy.blackjack.hand);
   expect(()=>parseSave(JSON.stringify(copy))).toThrow();
  }
 });
 it.each([-1,52,1.5,'9',null])('rejects invalid card %s',card=>{
  const source=blackjackWire();source.blackjack.hand.player[0]=card;
  expect(()=>parseSave(JSON.stringify(source))).toThrow();
 });
 it('rejects missing arrays, insufficient cards and completed active hands',()=>{
  for(const field of ['player','dealer','deck']){
   const source=blackjackWire();delete source.blackjack.hand[field];expect(()=>parseSave(JSON.stringify(source))).toThrow();
  }
  for(const [player,dealer] of [
   [[9],[8,5]],
   [[0,12],[9,7]],
   [[9,6,3],[8,5]],
   [[9,10,11],[8,5]],
   [[9,6],[0,12]],
  ]){
   const save={...initial(),blackjack:{hand:activeBlackjack(100n,player,dealer),rounds:[]}};
   expect(()=>parseSave(stringifySave(save))).toThrow();
  }
 });
 it.each(['0','1','3','-2','01','1e4',100])('requires an exact positive even blackjack stake: %s',stake=>{
  const source=blackjackWire();source.blackjack.hand.stake=stake;
  expect(()=>parseSave(JSON.stringify(source))).toThrow();
 });
 it('rejects concurrent unfinished rounds in the two games',()=>{
  const save={...initial(),pending:won(),blackjack:{hand:activeBlackjack(),rounds:[]}};
  expect(()=>parseSave(stringifySave(save))).toThrow();
 });
 it('requires distinct blackjack round ids and excludes the active id from settled history',()=>{
  const result=blackjackResult();
  expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:null,rounds:[result,result]}}))).toThrow();
  expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:activeBlackjack(),rounds:[blackjackResult('active-bj')]}}))).toThrow();
 });
 it('rejects invalid dates or empty identities in blackjack history and active state',()=>{
  for(const change of [{id:''},{date:'not a date'}]){
   expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:{...activeBlackjack(),...change},rounds:[]}}))).toThrow();
   expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:null,rounds:[{...blackjackResult(),...change}]}}))).toThrow();
  }
 });
 it('validates historical cards, result, payout and net rather than trusting imported winnings',()=>{
  const source=JSON.parse(stringifySave({...initial(),blackjack:{hand:null,rounds:[blackjackNatural()]}}));
  for(const change of [{payout:'251'},{net:'151'},{outcome:'win'},{player:[0,0]},{dealer:[9,12]},{stake:'101'},{doubled:'yes'}]){
   const copy=structuredClone(source);Object.assign(copy.blackjack.rounds[0],change);
   expect(()=>parseSave(JSON.stringify(copy))).toThrow();
  }
 });
 it('requires a doubled hand to have exactly three player cards and twice an originally even stake',()=>{
  const doubled={...blackjackResult(),doubled:true};
  expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:null,rounds:[doubled]}}))).toThrow();
  const badStake={id:'bad-double',date,stake:2n,player:[5,4,9],dealer:[8,7],outcome:'win' as const,payout:4n,net:2n,doubled:true};
  expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:null,rounds:[badStake]}}))).toThrow();
 });
 it('limits blackjack history to 10000 records while accepting exact winnings of any size',()=>{
  const rounds=Array.from({length:10001},(_,i)=>blackjackResult(String(i),10n**100n));
  expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:null,rounds}}))).toThrow();
  expect(parseSave(stringifySave({...initial(),blackjack:{hand:null,rounds:[rounds[0]]}})).blackjack.rounds[0].payout).toBe(2n*10n**100n);
 });
});


describe('completed blackjack dealer state',()=>{
 it('rejects a normal round settled before the dealer reaches 17',()=>{
  const unfinished={...blackjackResult(),dealer:[8,5]};
  expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:null,rounds:[unfinished]}}))).toThrow();
 });
 it('accepts immediate player bust or natural resolution without dealer draws',()=>{
  const bust={id:'bust',date,stake:100n,player:[9,10,11],dealer:[8,5],outcome:'loss' as const,payout:0n,net:-100n,doubled:false};
  const natural={...blackjackNatural(),dealer:[8,5]};
  const save={...initial(),blackjack:{hand:null,rounds:[bust,natural]}};
  expect(parseSave(stringifySave(save))).toEqual(save);
 });
 it('rejects extra dealer cards after an immediate natural or player bust',()=>{
  for(const entry of [
   {...blackjackNatural(),dealer:[8,5,3]},
   {id:'bust',date,stake:100n,player:[9,10,11],dealer:[8,5,3],outcome:'loss' as const,payout:0n,net:-100n,doubled:false},
  ])expect(()=>parseSave(stringifySave({...initial(),blackjack:{hand:null,rounds:[entry]}}))).toThrow();
 });
});
