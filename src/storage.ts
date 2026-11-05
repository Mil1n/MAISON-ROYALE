import { MAX_MONEY, payout, total, validId, type Bet, type Round } from './game';
export type Save = { version:1; balance:number; bets:Bet[]; lastBets:Bet[]; rounds:Round[]; sound:boolean; pending:Round|null };
export const KEY='maison-royale-v1';
export const initial = ():Save=>({version:1,balance:10000,bets:[],lastBets:[],rounds:[],sound:true,pending:null});
const integer=(v:unknown,max=MAX_MONEY):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
function checkBets(v:unknown):v is Bet[]{return Array.isArray(v)&&v.length<=2000&&v.every(b=>b&&validId(b.id)&&integer(b.amount)&&b.amount>0)&&total(v)<=MAX_MONEY;}
function checkRound(r:unknown):r is Round {
 if(!r||typeof r!=='object') return false;
 const x=r as Round;
 return typeof x.id==='string'&&x.id.length<100&&typeof x.date==='string'&&Number.isFinite(Date.parse(x.date))&&integer(x.number,36)&&checkBets(x.bets)&&x.stake>0&&x.stake===total(x.bets)&&x.payout===payout(x.bets,x.number)&&x.net===x.payout-x.stake;
}
export function parseSave(raw:string):Save {
 const s=JSON.parse(raw);
 if(!s||s.version!==1||!integer(s.balance)||!checkBets(s.bets)||!checkBets(s.lastBets)||!Array.isArray(s.rounds)||s.rounds.length>10000||!s.rounds.every(checkRound)||typeof s.sound!=='boolean'||(s.pending!==null&&!checkRound(s.pending))||s.balance+total(s.bets)>MAX_MONEY||(s.pending&&s.balance+s.pending.payout>MAX_MONEY)||new Set(s.rounds.map((r:Round)=>r.id)).size!==s.rounds.length) throw new Error('Файл сохранения повреждён или имеет неподдерживаемый формат.');
 if(s.pending&&(s.bets.length||s.rounds.some((r:Round)=>r.id===s.pending.id))) throw new Error('Некорректный незавершённый раунд.');
 return s;
}
export function recover(s:Save):Save {return s.pending?{...s,balance:Math.min(MAX_MONEY,s.balance+s.pending.payout),rounds:[s.pending,...s.rounds].slice(0,10000),pending:null}:s;}
export function load():{save:Save;warning:string} {
 try { const raw=localStorage.getItem(KEY);return {save:raw?recover(parseSave(raw)):initial(),warning:''}; }
 catch {return {save:initial(),warning:'Не удалось прочитать сохранение. Используется новый баланс; исходные данные не изменены до следующего действия.'};}
}
export function persist(s:Save):boolean {try{localStorage.setItem(KEY,JSON.stringify(s));return true;}catch{return false;}}
