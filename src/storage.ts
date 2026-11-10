import { payout, total, validId, validPocket, type Bet, type Round } from './game';

export type Save = {
 version:2;
 balance:bigint;
 bets:Bet[];
 lastBets:Bet[];
 rounds:Round[];
 sound:boolean;
 autoSpin:boolean;
 pending:Round|null;
};
export const KEY='maison-royale-v1';
export const initial = ():Save=>({version:2,balance:10000n,bets:[],lastBets:[],rounds:[],sound:true,autoSpin:true,pending:null});

const invalid = ():never => {throw new Error('Файл сохранения повреждён или имеет неподдерживаемый формат.');};
function record(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)) return invalid();
 return value as Record<string,unknown>;
}
// v1 used JSON numbers; only safe integers can be migrated without guessing
// digits already lost to floating-point rounding. v2 stores exact decimal text.
function amount(value:unknown,version:1|2,signed=false):bigint {
 if(version===1){
  if(typeof value!=='number'||!Number.isSafeInteger(value)||(!signed&&value<0)) return invalid();
  return BigInt(value);
 }
 if(typeof value!=='string'||!(signed?/^(0|-?[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)$/).test(value)) return invalid();
 return BigInt(value);
}
function bets(value:unknown,version:1|2):Bet[] {
 if(!Array.isArray(value)||value.length>2000) return invalid();
 return value.map(entry=>{
  const bet=record(entry);
  if(!validId(bet.id)) return invalid();
  const stake=amount(bet.amount,version);
  if(stake<=0n) return invalid();
  return {id:bet.id,amount:stake};
 });
}
function round(value:unknown,version:1|2):Round {
 const entry=record(value);
 if(typeof entry.id!=='string'||!entry.id.length||entry.id.length>=100||typeof entry.date!=='string'||!Number.isFinite(Date.parse(entry.date))||!validPocket(entry.number)) return invalid();
 const placed=bets(entry.bets,version),stake=amount(entry.stake,version),paid=amount(entry.payout,version),net=amount(entry.net,version,true);
 if(stake<=0n||stake!==total(placed)||paid!==payout(placed,entry.number)||net!==paid-stake) return invalid();
 return {id:entry.id,date:entry.date,number:entry.number,bets:placed,stake,payout:paid,net};
}
export function parseSave(raw:string):Save {
 const source=record(JSON.parse(raw));
 if(source.version!==1&&source.version!==2) return invalid();
 const version=source.version;
 if(typeof source.sound!=='boolean'||(source.autoSpin!==undefined&&typeof source.autoSpin!=='boolean')||(version===2&&typeof source.autoSpin!=='boolean')||!Array.isArray(source.rounds)||source.rounds.length>10000) return invalid();
 const parsed:Save={
  version:2,
  balance:amount(source.balance,version),
  bets:bets(source.bets,version),
  lastBets:bets(source.lastBets,version),
  rounds:source.rounds.map(entry=>round(entry,version)),
  sound:source.sound,
  autoSpin:source.autoSpin===undefined?true:source.autoSpin as boolean,
  pending:source.pending===null?null:round(source.pending,version),
 };
 const ids=new Set(parsed.rounds.map(entry=>entry.id));
 if(ids.size!==parsed.rounds.length) return invalid();
 if(parsed.pending&&(parsed.bets.length||ids.has(parsed.pending.id))) throw new Error('Некорректный незавершённый раунд.');
 return parsed;
}
export function stringifySave(save:Save,space?:number):string {
 return JSON.stringify(save,(_key,value:unknown)=>typeof value==='bigint'?value.toString():value,space);
}
export function recover(save:Save):Save {
 return save.pending?{...save,balance:save.balance+save.pending.payout,rounds:[save.pending,...save.rounds].slice(0,10000),pending:null}:save;
}
export function load():{save:Save;warning:string} {
 try {
  const raw=localStorage.getItem(KEY);
  return {save:raw?recover(parseSave(raw)):initial(),warning:''};
 }catch {
  return {save:initial(),warning:'Не удалось прочитать сохранение. Используется новый баланс; исходные данные не изменены до следующего действия.'};
 }
}
export function persist(save:Save):boolean {
 try {localStorage.setItem(KEY,stringifySave(save));return true;}catch{return false;}
}
