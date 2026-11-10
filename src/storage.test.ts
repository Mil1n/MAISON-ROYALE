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
 it('starts a version 2 save with a bigint balance under the existing storage key',()=>{
  expect(initial()).toEqual({version:2,balance:10000n,bets:[],lastBets:[],rounds:[],sound:true,autoSpin:true,pending:null});
  expect(KEY).toBe('maison-royale-v1');
 });
 it('round trips balances, bets, history and signed results far above Number.MAX_SAFE_INTEGER',()=>{
  const huge=12345678901234567890123456789012345678901234567890n;
  const save={...initial(),balance:huge,bets:[{id:'red',amount:huge}],lastBets:[{id:'n:00',amount:huge}],rounds:[won('huge-win',huge),lost('huge-loss',huge)],autoSpin:false};
  const serialized=stringifySave(save,2),json=JSON.parse(serialized);
  expect(json.version).toBe(2);
  expect(json.balance).toBe(huge.toString());
  expect(json.rounds[1].net).toBe((-huge).toString());
  expect(serialized).toContain('\n  "version": 2');
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
  expect(parsed.version).toBe(2);
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
 it.each(['','01','00','-0','+1','-1','1e6','1.0','0.1',' 1','1 ',1,null,true])('rejects noncanonical v2 balance %s',balance=>{
  expect(()=>parseSave(JSON.stringify({...wire(),balance}))).toThrow();
 });
 it.each(['-0','+100','01','-01','1e3','1.5',100])('rejects noncanonical v2 signed net %s',net=>{
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
