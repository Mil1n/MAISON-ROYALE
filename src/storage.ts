import { payout, total, validId, validPocket, type Bet, type Round } from './game';
import { validBaccaratRound, type BaccaratRound } from './baccarat';
import { validVideoPokerHand, validVideoPokerRound, type VideoPokerHand, type VideoPokerRound } from './videoPoker';
import { validateDiceHand, validateDiceRound, type DiceHand, type DiceRound } from './dice';
import { parseHoldemHand, parseHoldemRound, type HoldemHand, type HoldemRound } from './holdem';
import { evaluateBlackjack, handValue, isBlackjackStake, validCard, type Card, type BJHand, type BJRound } from './blackjack';

export type BalancePoint = {id:string;date:string;balance:bigint;kind:'start'|'roulette'|'blackjack'|'baccarat'|'videopoker'|'dice'|'holdem'|'topup'|'reset'};
export type Save = {
 version:5;
 animationSpeed:'slow'|'normal'|'fast';
 balanceHistory:BalancePoint[];
 baccarat:{rounds:BaccaratRound[]};
 videopoker:{hand:VideoPokerHand|null;rounds:VideoPokerRound[]};
 dice:{hand:DiceHand|null;rounds:DiceRound[]};
 holdem:{hand:HoldemHand|null;rounds:HoldemRound[]};
 activeGame:'roulette'|'blackjack'|'baccarat'|'videopoker'|'dice'|'holdem';
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
export const initial = ():Save=>({version:5,animationSpeed:'normal',balanceHistory:[],baccarat:{rounds:[]},videopoker:{hand:null,rounds:[]},dice:{hand:null,rounds:[]},holdem:{hand:null,rounds:[]},activeGame:'roulette',blackjack:{hand:null,rounds:[]},balance:10000n,bets:[],lastBets:[],rounds:[],sound:true,autoSpin:true,pending:null});

const invalid = ():never => {throw new Error('Файл сохранения повреждён или имеет неподдерживаемый формат.');};
function record(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value)) return invalid();
 return value as Record<string,unknown>;
}
// v1 used JSON numbers; only safe integers can be migrated without guessing
// digits already lost to floating-point rounding. v2+ store exact decimal text.
function amount(value:unknown,version:1|2|3|4|5,signed=false):bigint {
 if(version===1){
  if(typeof value!=='number'||!Number.isSafeInteger(value)||(!signed&&value<0)) return invalid();
  return BigInt(value);
 }
 if(typeof value!=='string'||!(signed?/^(0|-?[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)$/).test(value)) return invalid();
 return BigInt(value);
}
function bets(value:unknown,version:1|2|3|4|5):Bet[] {
 if(!Array.isArray(value)||value.length>2000) return invalid();
 return value.map(entry=>{
  const bet=record(entry);
  if(!validId(bet.id)) return invalid();
  const stake=amount(bet.amount,version);
  if(stake<=0n) return invalid();
  return {id:bet.id,amount:stake};
 });
}
function round(value:unknown,version:1|2|3|4|5):Round {
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
function baccaratSave(value:unknown):Save['baccarat'] {
 const entry=record(value);
 if(!Array.isArray(entry.rounds)||entry.rounds.length>10000) return invalid();
 const rounds=entry.rounds.map(value=>{
  const item=record(value);
  if(typeof item.id!=='string'||!item.id.length||item.id.length>=100||typeof item.date!=='string'||!Number.isFinite(Date.parse(item.date))) return invalid();
  const round={...item,stake:amount(item.stake,4),payout:amount(item.payout,4),net:amount(item.net,4,true)};
  if(!validBaccaratRound(round as BaccaratRound)) return invalid();
  return round as BaccaratRound;
 });
 if(new Set(rounds.map(item=>item.id)).size!==rounds.length) return invalid();
 return {rounds};
}
type Identified={id:string;date:string};
/** Shared bounds and identity rules for games whose engines validate private state. */
function multiTurnSave<H extends Identified,R extends Identified>(value:unknown,parseHand:(value:unknown)=>H,parseRound:(value:unknown)=>R):{hand:H|null;rounds:R[]} {
 const entry=record(value);
 if(!Array.isArray(entry.rounds)||entry.rounds.length>10000) return invalid();
 const identity=<T extends Identified>(item:T):T=>{
  if(typeof item.id!=='string'||!item.id.length||item.id.length>=100||typeof item.date!=='string'||!Number.isFinite(Date.parse(item.date))) return invalid();
  return item;
 };
 const rounds=entry.rounds.map(value=>identity(parseRound(value)));
 const hand=entry.hand===null?null:identity(parseHand(entry.hand));
 const ids=new Set(rounds.map(round=>round.id));
 if(ids.size!==rounds.length||(hand&&ids.has(hand.id))) return invalid();
 return {hand,rounds};
}
function videoPokerSave(value:unknown):Save['videopoker'] {
 const parseHand=(value:unknown):VideoPokerHand=>{
  const entry=record(value),hand={...entry,stake:amount(entry.stake,5)} as VideoPokerHand;
  return validVideoPokerHand(hand)?hand:invalid();
 };
 const parseRound=(value:unknown):VideoPokerRound=>{
  const entry=record(value),round={...entry,stake:amount(entry.stake,5),payout:amount(entry.payout,5),net:amount(entry.net,5,true)} as VideoPokerRound;
  return validVideoPokerRound(round)?round:invalid();
 };
 return multiTurnSave(value,parseHand,parseRound);
}
function diceSave(value:unknown):Save['dice'] {
 const parseHand=(value:unknown):DiceHand=>{
  const entry=record(value),hand={...entry,stake:amount(entry.stake,5)};
  return validateDiceHand(hand)?hand:invalid();
 };
 const parseRound=(value:unknown):DiceRound=>{
  const entry=record(value),round={...entry,stake:amount(entry.stake,5),payout:amount(entry.payout,5),net:amount(entry.net,5,true)};
  return validateDiceRound(round)?round:invalid();
 };
 return multiTurnSave(value,parseHand,parseRound);
}
const pointKinds=new Set(['start','roulette','blackjack','baccarat','videopoker','dice','holdem','topup','reset']);
function balanceHistory(value:unknown):BalancePoint[] {
 if(!Array.isArray(value)||value.length>1000) return invalid();
 const points=value.map(value=>{
  const point=record(value);
  if(typeof point.id!=='string'||!point.id.length||point.id.length>=100||typeof point.date!=='string'||!Number.isFinite(Date.parse(point.date))||!pointKinds.has(point.kind as string)) return invalid();
  return {id:point.id,date:point.date,balance:amount(point.balance,4),kind:point.kind as BalancePoint['kind']};
 });
 if(new Set(points.map(point=>point.id)).size!==points.length) return invalid();
 return points;
}
/** Available and reserved chips; accepted but unsettled winnings are excluded. */
function equity(save:Save):bigint {
 return save.balance+total(save.bets)+(save.blackjack.hand?.stake??0n)+(save.pending?.stake??0n)+(save.videopoker.hand?.stake??0n)+(save.dice.hand?.stake??0n)+(save.holdem.hand?.stake??0n);
}
/** Record real wallet changes without turning every reservation into a loss. */
export function recordBalance(previous:Save,next:Save,kind:Exclude<BalancePoint['kind'],'start'>,id:string=crypto.randomUUID()):Save {
 const date=new Date().toISOString();
 const history=previous.balanceHistory.length?previous.balanceHistory:[{id:crypto.randomUUID(),date,balance:equity(previous),kind:'start' as const}];
 // A recovered/saved settlement can be seen again, but must not create another point.
 if(history.some(point=>point.id===id)) return {...next,balanceHistory:history};
 return {...next,balanceHistory:[...history,{id,date,balance:equity(next),kind}].slice(-1000)};
}
export function parseSave(raw:string):Save {
 const source=record(JSON.parse(raw));
 if(source.version!==1&&source.version!==2&&source.version!==3&&source.version!==4&&source.version!==5) return invalid();
 const version=source.version;
 if(typeof source.sound!=='boolean'||(source.autoSpin!==undefined&&typeof source.autoSpin!=='boolean')||(version!==1&&typeof source.autoSpin!=='boolean')||!Array.isArray(source.rounds)||source.rounds.length>10000) return invalid();
 const parsed:Save={
  version:5,
  animationSpeed:version>=4?source.animationSpeed as Save['animationSpeed']:'normal',
  balanceHistory:version>=4?balanceHistory(source.balanceHistory):[],
  baccarat:version>=4?baccaratSave(source.baccarat):{rounds:[]},
  videopoker:version>=5?videoPokerSave(source.videopoker):{hand:null,rounds:[]},
  dice:version>=5?diceSave(source.dice):{hand:null,rounds:[]},
  holdem:version>=5?multiTurnSave(source.holdem,parseHoldemHand,parseHoldemRound):{hand:null,rounds:[]},
  activeGame:version>=3?source.activeGame as Save['activeGame']:'roulette',
  blackjack:version>=3?blackjackSave(source.blackjack):{hand:null,rounds:[]},
  balance:amount(source.balance,version),
  bets:bets(source.bets,version),
  lastBets:bets(source.lastBets,version),
  rounds:source.rounds.map(entry=>round(entry,version)),
  sound:source.sound,
  autoSpin:source.autoSpin===undefined?true:source.autoSpin as boolean,
  pending:source.pending===null?null:round(source.pending,version),
 };
 if(version>=3){
  const games=version===3?['roulette','blackjack']:version===4?['roulette','blackjack','baccarat']:['roulette','blackjack','baccarat','videopoker','dice','holdem'];
  if(!games.includes(source.activeGame as string)) return invalid();
 }
 if(version>=4&&!['slow','normal','fast'].includes(source.animationSpeed as string)) return invalid();
 const unfinished=([['roulette',parsed.pending],['blackjack',parsed.blackjack.hand],['videopoker',parsed.videopoker.hand],['dice',parsed.dice.hand],['holdem',parsed.holdem.hand]] as const).filter(([,hand])=>hand!==null);
 if(unfinished.length>1) throw new Error('Нельзя сохранить одновременно два незавершённых раунда.');
 if(unfinished.length) parsed.activeGame=unfinished[0][0];
 const ids=new Set(parsed.rounds.map(entry=>entry.id));
 if(ids.size!==parsed.rounds.length) return invalid();
 if(parsed.pending&&(parsed.bets.length||ids.has(parsed.pending.id))) throw new Error('Некорректный незавершённый раунд.');
 return parsed;
}
export function stringifySave(save:Save,space?:number):string {
 return JSON.stringify(save,(_key,value:unknown)=>typeof value==='bigint'?value.toString():value,space);
}
export function recover(save:Save):Save {
 if(!save.pending) return save;
 const round=save.pending;
 return recordBalance(save,{...save,balance:save.balance+round.payout,rounds:[round,...save.rounds].slice(0,10000),pending:null},'roulette',round.id);
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
