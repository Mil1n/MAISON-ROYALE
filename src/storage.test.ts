import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Bet, type Round } from './game';
import { startHoldem, actHoldem, type HoldemHand } from './holdem';
import { initial, KEY, load, parseSave, persist, recover, recordBalance, stringifySave } from './storage';

const date='2026-11-10T12:00:00.000Z';
const legacy=()=>({version:1,balance:10000,bets:[],lastBets:[],rounds:[],sound:true,pending:null});
const wire=()=>JSON.parse(stringifySave(initial()));
const won=(id='win',stake=100n):Round=>({id,date,number:'00',bets:[{id:'n:00',amount:stake}],stake,payout:stake*36n,net:stake*35n});
const lost=(id='loss',stake=100n):Round=>({id,date,number:'00',bets:[{id:'n:0',amount:stake}],stake,payout:0n,net:-stake});
const legacyWon=(id='legacy-win')=>({id,date,number:0,bets:[{id:'n:0',amount:1000000000}],stake:1000000000,payout:36000000000,net:35000000000});
afterEach(()=>vi.unstubAllGlobals());

describe('exact save serialization',()=>{
 it('starts a version 5 save with a bigint balance under the existing storage key',()=>{
  expect(initial()).toEqual({version:5,animationSpeed:'normal',balanceHistory:[],baccarat:{rounds:[]},videopoker:{hand:null,rounds:[]},dice:{hand:null,rounds:[]},holdem:{hand:null,rounds:[]},activeGame:'roulette',blackjack:{hand:null,rounds:[]},balance:10000n,bets:[],lastBets:[],rounds:[],sound:true,autoSpin:true,pending:null});
  expect(KEY).toBe('maison-royale-v1');
 });
 it('round trips balances, bets, history and signed results far above Number.MAX_SAFE_INTEGER',()=>{
  const huge=12345678901234567890123456789012345678901234567890n;
  const save={...initial(),balance:huge,bets:[{id:'red',amount:huge}],lastBets:[{id:'n:00',amount:huge}],rounds:[won('huge-win',huge),lost('huge-loss',huge)],autoSpin:false};
  const serialized=stringifySave(save,2),json=JSON.parse(serialized);
  expect(json.version).toBe(5);
  expect(json.balance).toBe(huge.toString());
  expect(json.rounds[1].net).toBe((-huge).toString());
  expect(serialized).toContain('\n  "version": 5');
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
  expect(parsed.version).toBe(5);
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
  expect(restored.version).toBe(5);
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
 it.each([null,{},'roulette',[],{hand:null},{rounds:[]}])('requires complete blackjack state in current saves: %j',blackjack=>{
  expect(()=>parseSave(JSON.stringify({...wire(),blackjack}))).toThrow();
 });
 it('requires a known active game in current saves',()=>{
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

describe('version 4 settings and wallet history',()=>{
 it('migrates v3 with all blackjack data intact and starts tracking only future balances',()=>{
  const save={...initial(),balance:10n**80n,activeGame:'blackjack' as const,blackjack:{hand:activeBlackjack(),rounds:[blackjackNatural()]}};
  const old=JSON.parse(stringifySave(save));old.version=3;
  delete old.animationSpeed;delete old.balanceHistory;delete old.baccarat;
  expect(parseSave(JSON.stringify(old))).toEqual(save);
 });
 it.each(['slow','normal','fast'] as const)('persists the %s animation setting',animationSpeed=>{
  const save={...initial(),animationSpeed};
  expect(parseSave(stringifySave(save))).toEqual(save);
 });
 it.each([undefined,null,'instant',0,true])('rejects unknown animation settings: %s',animationSpeed=>{
  expect(()=>parseSave(JSON.stringify({...wire(),animationSpeed}))).toThrow();
 });
 it('records initial and final equity, including reserved chips but not speculative winnings',()=>{
  const previous={...initial(),activeGame:'blackjack' as const,balance:8900n,bets:[{id:'red',amount:100n}],blackjack:{hand:activeBlackjack(1000n),rounds:[]}};
  const next={...previous,balance:9900n};
  const tracked=recordBalance(previous,next,'topup','deposit');
  expect(tracked.balanceHistory.map(point=>point.balance)).toEqual([10000n,11000n]);
  expect(tracked.balanceHistory.map(point=>point.kind)).toEqual(['start','topup']);
  expect(parseSave(stringifySave(tracked))).toEqual(tracked);
 });
 it('records recovered roulette payout once and retains the pre-bet baseline',()=>{
  const save={...initial(),balance:9900n,pending:won('recovered')};
  const recovered=recover(save);
  expect(recovered.balanceHistory.map(point=>point.balance)).toEqual([10000n,13500n]);
  expect(recovered.balanceHistory[1]).toMatchObject({id:'recovered',kind:'roulette'});
  expect(recover(recovered)).toBe(recovered);
  expect(recordBalance(recovered,recovered,'roulette','recovered').balanceHistory).toEqual(recovered.balanceHistory);
 });
 it('retains the newest 1000 events and accepts a clock moving backward without reordering them',()=>{
  const history=Array.from({length:1000},(_,i)=>({id:`p-${i}`,date:'2099-01-01T00:00:00.000Z',balance:BigInt(i),kind:'topup' as const}));
  const previous={...initial(),balanceHistory:history};
  const tracked=recordBalance(previous,{...previous,balance:7n},'reset','reset');
  expect(tracked.balanceHistory).toHaveLength(1000);
  expect(tracked.balanceHistory[0].id).toBe('p-1');
  expect(tracked.balanceHistory.at(-1)).toMatchObject({id:'reset',balance:7n,kind:'reset'});
  expect(parseSave(stringifySave(tracked))).toEqual(tracked);
 });
 it('rejects malformed, oversized, duplicated or nonexact wallet history',()=>{
  const point={id:'start',date,balance:'10000',kind:'start'};
  for(const balanceHistory of [undefined,null,{},[null],[{...point,balance:10000}],[{...point,balance:'01'}],[{...point,balance:'-1'}],[{...point,date:'bad'}],[{...point,id:''}],[{...point,kind:'mystery'}],[point,point],Array(1001).fill(point)]){
   expect(()=>parseSave(JSON.stringify({...wire(),balanceHistory}))).toThrow();
  }
 });
});

const baccaratResult=()=>({id:'baccarat-win',date,stake:20n,bet:'banker' as const,player:[6,9],banker:[7,9],winner:'banker' as const,payout:39n,net:19n});
describe('baccarat persistence',()=>{
 it('round trips exact commission payouts and selected table without recrediting the wallet',()=>{
  const huge=20n*10n**100n;
  const round={...baccaratResult(),stake:huge,payout:huge*39n/20n,net:huge*19n/20n};
  const save={...initial(),activeGame:'baccarat' as const,balance:huge,baccarat:{rounds:[round]}};
  const parsed=parseSave(stringifySave(save));
  expect(parsed).toEqual(save);
  expect(recover(parsed)).toBe(parsed);
 });
 it('validates rules, payouts, bets and identities instead of trusting an imported result',()=>{
  const source=JSON.parse(stringifySave({...initial(),baccarat:{rounds:[baccaratResult()]}}));
  for(const change of [{payout:'40'},{net:'20'},{winner:'player'},{bet:'house'},{stake:'21'},{stake:20},{player:[0,1,2]},{banker:[52,9]},{player:null},{date:'bad'},{id:''}]){
   const copy=structuredClone(source);Object.assign(copy.baccarat.rounds[0],change);
   expect(()=>parseSave(JSON.stringify(copy))).toThrow();
  }
 });
 it('requires complete baccarat state with bounded, unique rounds',()=>{
  const result=baccaratResult();
  for(const baccarat of [null,{},[],{rounds:null},{rounds:[result,result]},{rounds:Array.from({length:10001},(_,i)=>({...result,id:`b-${i}`}))}]){
   expect(()=>parseSave(stringifySave({...initial(),baccarat} as never))).toThrow();
  }
 });
 it('does not allow baccarat as an active game in an older schema',()=>{
  const old={...wire(),version:3,activeGame:'baccarat'};
  expect(()=>parseSave(JSON.stringify(old))).toThrow();
 });
});

describe('version 5 games migration',()=>{
 it('migrates v4 with every old table, setting and tracked balance preserved',()=>{
  const tracked=recordBalance(initial(),{...initial(),balance:12000n,animationSpeed:'fast'},'topup','old-topup');
  const save={...tracked,activeGame:'baccarat' as const,baccarat:{rounds:[baccaratResult()]},rounds:[lost()],blackjack:{hand:null,rounds:[blackjackNatural()]}};
  const old=JSON.parse(stringifySave(save));old.version=4;
  delete old.videopoker;delete old.dice;delete old.holdem;
  expect(parseSave(JSON.stringify(old))).toEqual(save);
 });
 it.each(['videopoker','dice','holdem'])('rejects the new %s table in v4',activeGame=>{
  expect(()=>parseSave(JSON.stringify({...wire(),version:4,activeGame}))).toThrow();
 });
 it.each(['videopoker','dice','holdem'] as const)('requires complete current %s state',game=>{
  for(const state of [undefined,null,{},[],{hand:null},{rounds:[]},{hand:null,rounds:null}]){
   expect(()=>parseSave(JSON.stringify({...wire(),[game]:state}))).toThrow();
  }
 });
});

function pokerHand(stake=100n) {
 return {id:'poker-active',date,stake,cards:[0,9,10,11,12],deck:Array.from({length:52},(_,i)=>i).filter(i=>![0,9,10,11,12].includes(i))};
}
function pokerResult(stake=100n) {
 const hand=pokerHand(stake);
 return {id:'poker-won',date,stake,initialCards:hand.cards,cards:hand.cards,held:[0,1,2,3,4],category:'royal' as const,payout:250n*stake,net:249n*stake};
}
const diceHand=(stake=100n)=>({id:'dice-active',date,stake,point:6,rolls:[[3,3],[1,2]] as [number,number][]});
const diceResult=(stake=100n)=>({id:'dice-won',date,stake,point:6,rolls:[[3,3],[1,2],[2,4]] as [number,number][],outcome:'win' as const,payout:stake*2n,net:stake});

describe('videopoker save state',()=>{
 it('restores exact private draw order and reserved stake on its table, without recredit',()=>{
  const save={...initial(),balance:10n**90n,videopoker:{hand:pokerHand(10n**80n),rounds:[pokerResult()]}};
  const parsed=parseSave(stringifySave(save));
  expect(parsed).toEqual({...save,activeGame:'videopoker'});
  expect(parsed.videopoker.hand?.deck).toEqual(save.videopoker.hand.deck);
  expect(recover(parsed)).toBe(parsed);
 });
 it('validates complete deck partition and positive exact stake',()=>{
  const source=JSON.parse(stringifySave({...initial(),videopoker:{hand:pokerHand(),rounds:[]}}));
  for(const change of [{cards:[0,0,10,11,12]},{cards:[0,1,2,3]},{deck:Array(47).fill(1)},{stake:'0'},{stake:100},{stake:'01'},{date:'bad'},{id:''}]){
   const copy=structuredClone(source);Object.assign(copy.videopoker.hand,change);
   expect(()=>parseSave(JSON.stringify(copy))).toThrow();
  }
 });
 it('rejects forged held positions, replacements and winnings',()=>{
  const source=JSON.parse(stringifySave({...initial(),videopoker:{hand:null,rounds:[pokerResult()]}}));
  for(const change of [{held:[0,0]},{held:[0,1,2,3]},{cards:[0,9,10,11,25]},{category:'flush'},{payout:'24900'},{net:'24901'}]){
   const copy=structuredClone(source);Object.assign(copy.videopoker.rounds[0],change);
   expect(()=>parseSave(JSON.stringify(copy))).toThrow();
  }
 });
 it('preserves settled returns without paying them a second time',()=>{
  const save={...initial(),activeGame:'videopoker' as const,balance:25000n,videopoker:{hand:null,rounds:[pokerResult()]}};
  expect(recover(parseSave(stringifySave(save)))).toEqual(save);
 });
});

describe('dice save replay',()=>{
 it('preserves a point and all previous throws through repeat loads without settling it',()=>{
  const save={...initial(),activeGame:'dice' as const,balance:9900n,dice:{hand:diceHand(),rounds:[]}};
  const parsed=recover(parseSave(stringifySave(save)));
  expect(parsed).toEqual(save);
  expect(recover(parseSave(stringifySave(parsed)))).toEqual(save);
 });
 it('restores an unfinished game to its table and validates every previous throw',()=>{
  const save={...initial(),dice:{hand:diceHand(),rounds:[]}};
  expect(parseSave(stringifySave(save)).activeGame).toBe('dice');
  const source=JSON.parse(stringifySave(save));
  for(const change of [{point:8},{rolls:[[0,6]]},{rolls:[[7,1]]},{rolls:[[1.5,4.5]]},{rolls:[[3,4],[3,3]]},{rolls:[[3,3],[3,4]]},{stake:'0'},{stake:100}]){
   const copy=structuredClone(source);Object.assign(copy.dice.hand,change);
   expect(()=>parseSave(JSON.stringify(copy))).toThrow();
  }
 });
 it('checks terminal throw, payout and net and does not replay a paid return',()=>{
  const save={...initial(),activeGame:'dice' as const,balance:10100n,dice:{hand:null,rounds:[diceResult()]}};
  expect(recover(parseSave(stringifySave(save)))).toEqual(save);
  const source=JSON.parse(stringifySave(save));
  for(const change of [{outcome:'loss'},{payout:'201'},{net:'101'},{rolls:[[3,3],[1,2]]},{rolls:[[3,3],[3,4],[2,4]]}]){
   const copy=structuredClone(source);Object.assign(copy.dice.rounds[0],change);
   expect(()=>parseSave(JSON.stringify(copy))).toThrow();
  }
 });
});

describe('multiple table save invariants',()=>{
 it('rejects every pair of simultaneous unfinished hands and accepted roulette spins',()=>{
  const unfinished=[{pending:won()},{blackjack:{hand:activeBlackjack(),rounds:[]}},{videopoker:{hand:pokerHand(),rounds:[]}},{dice:{hand:diceHand(),rounds:[]}},{holdem:{hand:holdemHand(),rounds:[]}}];
  for(let i=0;i<unfinished.length;i++)for(let j=i+1;j<unfinished.length;j++){
   expect(()=>parseSave(stringifySave({...initial(),...unfinished[i],...unfinished[j]}))).toThrow();
  }
 });
 it('forbids duplicate history ids, active ids in paid history, and more than 10000 game rounds',()=>{
  const histories=[['videopoker',pokerHand(),pokerResult()],['dice',diceHand(),diceResult()]] as const;
  for(const [game,hand,result] of histories){
   for(const state of [{hand:null,rounds:[result,result]},{hand,rounds:[{...result,id:hand.id}]},{hand:null,rounds:Array.from({length:10001},(_,i)=>({...result,id:`r-${i}`}))}]){
    expect(()=>parseSave(stringifySave({...initial(),[game]:state}))).toThrow();
   }
  }
 });
 it.each(['videopoker','dice','holdem'] as const)('includes the reserved %s stake in initial tracked equity',game=>{
  // This helper only records wallet changes; model validity is checked on import.
  const previous={...initial(),balance:9900n,[game]:{hand:{stake:100n},rounds:[]}} as never;
  const next={...initial(),balance:10100n};
  const tracked=recordBalance(previous,next,game,'settlement');
  expect(tracked.balanceHistory.map(point=>point.balance)).toEqual([10000n,10100n]);
  expect(tracked.balanceHistory[1].kind).toBe(game);
 });
});

function holdemHand(stake=1000n):HoldemHand {
 const turn=startHoldem(stake,0,Array.from({length:52},(_,i)=>i));
 if(!turn.hand)throw new Error('Expected active hand');
 return turn.hand;
}
function holdemResult(stake=1000n) {
 const start=holdemHand(stake);
 const first=actHoldem(start,{type:'raise',amount:stake});
 if(!first.hand)throw new Error('Expected opponent turn');
 const second=actHoldem(first.hand,{type:'fold'});
 if(!second.hand)throw new Error('Expected second opponent turn');
 const third=actHoldem(second.hand,{type:'fold'});
 if(!third.round)throw new Error('Expected settled hand');
 return third.round;
}
describe('holdem persistence replay',()=>{
 it('restores complete private deck and stacks with the reserved buyin unchanged',()=>{
  const hand=holdemHand(10n**50n);
  const save={...initial(),balance:7n,holdem:{hand,rounds:[]}};
  const restored=recover(parseSave(stringifySave(save)));
  expect(restored).toEqual({...save,activeGame:'holdem'});
  expect(recover(parseSave(stringifySave(restored)))).toEqual(restored);
 });
 it('replays paid actions and awards without paying a settled return twice',()=>{
  const round=holdemResult();
  const save={...initial(),balance:round.payout,activeGame:'holdem' as const,holdem:{hand:null,rounds:[round]}};
  expect(recover(parseSave(stringifySave(save)))).toEqual(save);
 });
 it('rejects forged deck, stacks, wager, action rights and numeric money',()=>{
  const source=JSON.parse(stringifySave({...initial(),holdem:{hand:holdemHand(),rounds:[]}}));
  const mutators=[
   (hand:Record<string,unknown>)=>{hand.stake=1000;},
   (hand:Record<string,unknown>)=>{hand.bet='21';},
   (hand:Record<string,unknown>)=>{hand.cursor=7;},
   (hand:Record<string,unknown>)=>{hand.pending=[0];},
   (hand:Record<string,unknown>)=>{hand.actedAt=['20',null,null];},
   (hand:Record<string,unknown>)=>{hand.deck=Array(52).fill(1);},
   (hand:Record<string,unknown>)=>{(hand.seats as {stack:string}[])[0].stack='1001';},
   (hand:Record<string,unknown>)=>{(hand.seats as {hole:number[]}[])[1].hole=[0,0];},
  ];
  for(const mutate of mutators){const copy=structuredClone(source);mutate(copy.holdem.hand);expect(()=>parseSave(JSON.stringify(copy))).toThrow();}
 });
 it('rejects forged result, pot, awards and action history',()=>{
  const source=JSON.parse(stringifySave({...initial(),holdem:{hand:null,rounds:[holdemResult()]}}));
  for(const change of [{payout:'1031'},{net:'31'},{pot:'10000'},{winners:[1]},{awards:['1000','0','0']},{actions:[]}]){
   const copy=structuredClone(source);Object.assign(copy.holdem.rounds[0],change);
   expect(()=>parseSave(JSON.stringify(copy))).toThrow();
  }
 });
 it('rejects duplicate ids and an already-settled active hand',()=>{
  const round=holdemResult();
  const hand={...holdemHand(),id:round.id,date:round.date};
  for(const state of [{hand:null,rounds:[round,round]},{hand,rounds:[round]},{hand:null,rounds:Array.from({length:10001},(_,i)=>({...round,id:`h-${i}`}))}]){
   expect(()=>parseSave(stringifySave({...initial(),holdem:state}))).toThrow();
  }
 });
});
