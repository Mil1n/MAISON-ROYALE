import { payout, total, validId, validPocket, type Bet, type Round } from './game';
import { evaluateBlackjack, handValue, isBlackjackStake, validCard, type Card, type BJHand, type BJRound } from './blackjack';

export type Save = {
 version:3;
 activeGame:'roulette'|'blackjack';
 blackjack:{hand:BJHand|null;rounds:BJRound[]};
 balance:bigint;
 bets:Bet[];
 lastBets:Bet[];
 rounds:Round[];
 sound:boolean;
 autoSpin:boolean;
 pending:Round|null;
};
export const KEY='maison-royale-v1';
export const initial = ():Save=>({version:3,activeGame:'roulette',blackjack:{hand:null,rounds:[]},balance:10000n,bets:[],lastBets:[],rounds:[],sound:true,autoSpin:true,pending:null});

const invalid = ():never => {throw new Error('Файл сохранения повреждён или имеет неподдерживаемый формат.');};
function record(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)) return invalid();
 return value as Record<string,unknown>;
}
// v1 used JSON numbers; only safe integers can be migrated without guessing
// digits already lost to floating-point rounding. v2/v3 store exact decimal text.
function amount(value:unknown,version:1|2|3,signed=false):bigint {
 if(version===1){
  if(typeof value!=='number'||!Number.isSafeInteger(value)||(!signed&&value<0)) return invalid();
  return BigInt(value);
 }
 if(typeof value!=='string'||!(signed?/^(0|-?[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)$/).test(value)) return invalid();
 return BigInt(value);
}
function bets(value:unknown,version:1|2|3):Bet[] {
 if(!Array.isArray(value)||value.length>2000) return invalid();
 return value.map(entry=>{
  const bet=record(entry);
  if(!validId(bet.id)) return invalid();
  const stake=amount(bet.amount,version);
  if(stake<=0n) return invalid();
  return {id:bet.id,amount:stake};
 });
}
function round(value:unknown,version:1|2|3):Round {
 const entry=record(value);
 if(typeof entry.id!=='string'||!entry.id.length||entry.id.length>=100||typeof entry.date!=='string'||!Number.isFinite(Date.parse(entry.date))||!validPocket(entry.number)) return invalid();
 const placed=bets(entry.bets,version),stake=amount(entry.stake,version),paid=amount(entry.payout,version),net=amount(entry.net,version,true);
 if(stake<=0n||stake!==total(placed)||paid!==payout(placed,entry.number)||net!==paid-stake) return invalid();
 return {id:entry.id,date:entry.date,number:entry.number,bets:placed,stake,payout:paid,net};
}
function cards(value:unknown,min=0):Card[] {
 if(!Array.isArray(value)||value.length<min||value.length>52||!value.every(validCard)) return invalid();
 return [...value];
}
function uniqueCards(...hands:Card[][]):boolean {
 const all=hands.flat();
 return all.length<=52&&new Set(all).size===all.length;
}
function blackjackIdentity(entry:Record<string,unknown>):{id:string;date:string;stake:bigint} {
 if(typeof entry.id!=='string'||!entry.id.length||entry.id.length>=100||typeof entry.date!=='string'||!Number.isFinite(Date.parse(entry.date))) return invalid();
 const stake=amount(entry.stake,3);
 if(!isBlackjackStake(stake)) return invalid();
 return {id:entry.id,date:entry.date,stake};
}
function blackjackHand(value:unknown):BJHand {
 const entry=record(value),identity=blackjackIdentity(entry);
 const player=cards(entry.player,2),dealer=cards(entry.dealer,2),deck=cards(entry.deck);
 const points=handValue(player);
 if(dealer.length!==2||player.length+dealer.length+deck.length!==52||!uniqueCards(player,dealer,deck)||points.total>=21||points.natural||points.bust||handValue(dealer).natural) return invalid();
 return {...identity,player,dealer,deck};
}
function blackjackRound(value:unknown):BJRound {
 const entry=record(value),identity=blackjackIdentity(entry);
 const player=cards(entry.player,2),dealer=cards(entry.dealer,2);
 if(!uniqueCards(player,dealer)||typeof entry.doubled!=='boolean'||(entry.doubled&&(identity.stake%4n!==0n||player.length!==3))) return invalid();
 const playerValue=handValue(player),dealerValue=handValue(dealer);
 if(!playerValue.bust&&!playerValue.natural&&!dealerValue.natural&&dealerValue.total<17) return invalid();
 if((playerValue.bust||playerValue.natural||dealerValue.natural)&&dealer.length!==2) return invalid();
 if(dealerValue.natural&&player.length!==2) return invalid();
 const paid=amount(entry.payout,3),net=amount(entry.net,3,true);
 const calculated=evaluateBlackjack(player,dealer,identity.stake,entry.doubled);
 if(entry.outcome!==calculated.outcome||paid!==calculated.payout||net!==calculated.net) return invalid();
 return {...identity,player,dealer,...calculated,doubled:entry.doubled};
}
function blackjackSave(value:unknown):Save['blackjack'] {
 const entry=record(value);
 if(!Array.isArray(entry.rounds)||entry.rounds.length>10000) return invalid();
 const rounds=entry.rounds.map(blackjackRound),ids=new Set(rounds.map(item=>item.id));
 const hand=entry.hand===null?null:blackjackHand(entry.hand);
 if(ids.size!==rounds.length||(hand&&ids.has(hand.id))) return invalid();
 return {hand,rounds};
}
export function parseSave(raw:string):Save {
 const source=record(JSON.parse(raw));
 if(source.version!==1&&source.version!==2&&source.version!==3) return invalid();
 const version=source.version;
 if(typeof source.sound!=='boolean'||(source.autoSpin!==undefined&&typeof source.autoSpin!=='boolean')||(version!==1&&typeof source.autoSpin!=='boolean')||!Array.isArray(source.rounds)||source.rounds.length>10000) return invalid();
 const parsed:Save={
  version:3,
  activeGame:version===3&&(source.activeGame==='roulette'||source.activeGame==='blackjack')?source.activeGame:'roulette',
  blackjack:version===3?blackjackSave(source.blackjack):{hand:null,rounds:[]},
  balance:amount(source.balance,version),
  bets:bets(source.bets,version),
  lastBets:bets(source.lastBets,version),
  rounds:source.rounds.map(entry=>round(entry,version)),
  sound:source.sound,
  autoSpin:source.autoSpin===undefined?true:source.autoSpin as boolean,
  pending:source.pending===null?null:round(source.pending,version),
 };
 if(version===3&&source.activeGame!=='roulette'&&source.activeGame!=='blackjack') return invalid();
 if(parsed.blackjack.hand){
  if(parsed.pending) throw new Error('Нельзя сохранить одновременно два незавершённых раунда.');
  parsed.activeGame='blackjack';
 }
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
