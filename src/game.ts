export const WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const color = (n:number):'red'|'black'|'green' => n===0?'green':RED.has(n)?'red':'black';
export const colorName = (n:number) => ({red:'Красное',black:'Чёрное',green:'Зелёное'})[color(n)];
export type Bet = { id:string; amount:number };
export type Round = { id:string; date:string; number:number; bets:Bet[]; stake:number; payout:number; net:number };
export const MAX_MONEY = 1_000_000_000;
export function wins(id:string,n:number):boolean {
 if(id.startsWith('n:')) return Number(id.slice(2))===n;
 if(n===0) return false;
 if(id==='red'||id==='black') return color(n)===id;
 if(id==='even') return n%2===0;
 if(id==='odd') return n%2===1;
 if(id==='low') return n<=18;
 if(id==='high') return n>=19;
 if(id.startsWith('dozen:')) return Math.ceil(n/12)===Number(id.slice(6));
 if(id.startsWith('col:')) return ((n-1)%3)+1===Number(id.slice(4));
 return false;
}
export const multiplier = (id:string) => id.startsWith('n:')?36:id.startsWith('dozen:')||id.startsWith('col:')?3:2;
export const total = (bets:Bet[]) => bets.reduce((s,b)=>s+b.amount,0);
export const payout = (bets:Bet[],n:number) => bets.reduce((s,b)=>s+(wins(b.id,n)?b.amount*multiplier(b.id):0),0);
export function randomNumber():number {
 const a=new Uint32Array(1); const limit=2**32-(2**32%37);
 do { crypto.getRandomValues(a); } while(a[0]>=limit);
 return a[0]%37;
}
export function nextRotation(current:number,n:number):number {
 const target=(360-WHEEL.indexOf(n)*360/37)%360;
 return current+360*6+((target-current%360+360)%360);
}
export function betName(id:string):string {
 const names:Record<string,string>={red:'Красное',black:'Чёрное',even:'Чёт',odd:'Нечёт',low:'1–18',high:'19–36'};
 return names[id]??(id.startsWith('n:')?`Число ${id.slice(2)}`:id.startsWith('dozen:')?`Дюжина ${id.slice(6)}`:`Колонка ${id.slice(4)}`);
}
export const money = (n:number) => new Intl.NumberFormat('ru-RU').format(n);
export const validId = (id:unknown):id is string => typeof id==='string' && (/^n:([0-9]|[12][0-9]|3[0-6])$/.test(id)||/^(red|black|even|odd|low|high|dozen:[123]|col:[123])$/.test(id));
