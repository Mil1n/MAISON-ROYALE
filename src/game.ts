export type Money = bigint;
export type Pocket = number | '00';
export const WHEEL: Pocket[] = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,'00',27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const validPocket = (n:unknown):n is Pocket => n==='00'||(typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=36);
export const color = (n:Pocket):'red'|'black'|'green' => n===0||n==='00'?'green':RED.has(n)?'red':'black';
export const colorName = (n:Pocket) => ({red:'Красное',black:'Чёрное',green:'Зелёное'})[color(n)];
export type Bet = { id:string; amount:Money };
export type Round = { id:string; date:string; number:Pocket; bets:Bet[]; stake:Money; payout:Money; net:Money };
export function wins(id:string,n:Pocket):boolean {
 if(id.startsWith('n:')) return id===`n:${n}`;
 if(n===0||n==='00') return false;
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
export const total = (bets:Bet[]) => bets.reduce((s,b)=>s+b.amount,0n);
export const payout = (bets:Bet[],n:Pocket) => bets.reduce((s,b)=>s+(wins(b.id,n)?b.amount*BigInt(multiplier(b.id)):0n),0n);
export function randomNumber():Pocket {
 const a=new Uint32Array(1); const limit=2**32-(2**32%WHEEL.length);
 do { crypto.getRandomValues(a); } while(a[0]>=limit);
 return WHEEL[a[0]%WHEEL.length];
}
export function nextRotation(current:number,n:Pocket):number {
 const index=WHEEL.indexOf(n);
 if(index<0) throw new RangeError('Неизвестный сектор рулетки.');
 const target=(360-index*360/WHEEL.length)%360;
 return current+360*6+((target-current%360+360)%360);
}
export function betName(id:string):string {
 const names:Record<string,string>={red:'Красное',black:'Чёрное',even:'Чёт',odd:'Нечёт',low:'1–18',high:'19–36'};
 return names[id]??(id.startsWith('n:')?`Число ${id.slice(2)}`:id.startsWith('dozen:')?`${(Number(id.slice(6))-1)*12+1}–${Number(id.slice(6))*12}`:`Колонка ${id.slice(4)}`);
}
export function parseMoneyInput(value:string):Money|null {
 const digits=value.replace(/\s/g,'');
 if(!/^[0-9]+$/.test(digits)) return null;
 try { return BigInt(digits); } catch { return null; }
}
export const money = (n:Money|number) => new Intl.NumberFormat('ru-RU').format(n);
export const validId = (id:unknown):id is string => typeof id==='string' && (/^n:(00|[0-9]|[12][0-9]|3[0-6])$/.test(id)||/^(red|black|even|odd|low|high|dozen:[123]|col:[123])$/.test(id));
