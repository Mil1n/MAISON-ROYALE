/** Craps: a single Pass Line bet. Visual dice never select the outcome. */
export type DicePair = [number, number];
export type DiceHand = { id:string; date:string; stake:bigint; point:number; rolls:DicePair[] };
export type DiceRound = { id:string; date:string; stake:bigint; point:number|null; rolls:DicePair[]; outcome:'win'|'loss'; payout:bigint; net:bigint };
export type DiceTurn = { hand:DiceHand|null; round:DiceRound|null };
export const isDiceStake=(stake:unknown):stake is bigint=>typeof stake==='bigint'&&stake>0n;
const validDie=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=1&&n<=6;
const validPair=(value:unknown):value is DicePair=>Array.isArray(value)&&value.length===2&&value.every(validDie);

/** Rejection sampling keeps all six faces equally likely, including modulo edges. */
export function randomDie():number {
 const sample=new Uint32Array(1),limit=2**32-(2**32%6);
 do { crypto.getRandomValues(sample); } while(sample[0]>=limit);
 return sample[0]%6+1;
}
function pair(explicit?:readonly [number,number]):DicePair {
 if(explicit!==undefined){if(!validPair(explicit))throw new RangeError('Нужны две кости с гранями от 1 до 6.');return [explicit[0],explicit[1]];}
 return [randomDie(),randomDie()];
}
/** Reject any sequence that continues after settlement. */
function replay(rolls:unknown):{point:number|null;outcome:'win'|'loss'|null}|null {
 if(!Array.isArray(rolls)||!rolls.length||rolls.length>10000||!rolls.every(validPair))return null;
 let point:number|null=null,outcome:'win'|'loss'|null=null;
 for(let i=0;i<rolls.length;i++){
  if(outcome)return null;
  const sum=rolls[i][0]+rolls[i][1];
  if(i===0){
   if(sum===7||sum===11)outcome='win';
   else if(sum===2||sum===3||sum===12)outcome='loss';
   else point=sum;
  }else if(sum===point)outcome='win';
  else if(sum===7)outcome='loss';
 }
 return {point,outcome};
}
function base(value:unknown):value is Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return typeof v.id==='string'&&v.id.length>0&&v.id.length<100&&typeof v.date==='string'&&Number.isFinite(Date.parse(v.date))&&isDiceStake(v.stake);
}
export function validateDiceHand(value:unknown):value is DiceHand {
 if(!base(value))return false;
 const result=replay(value.rolls);
 return !!result&&result.outcome===null&&result.point!==null&&value.point===result.point;
}
export function validateDiceRound(value:unknown):value is DiceRound {
 if(!base(value))return false;
 const result=replay(value.rolls);
 if(!result||!result.outcome||value.point!==result.point||value.outcome!==result.outcome)return false;
 const stake=value.stake as bigint,payout=result.outcome==='win'?stake*2n:0n;
 return value.payout===payout&&value.net===payout-stake;
}
function result(source:{id:string;date:string;stake:bigint},rolls:DicePair[]):DiceTurn {
 const state=replay(rolls);
 if(!state)throw new RangeError('Некорректная последовательность бросков.');
 if(!state.outcome)return {hand:{...source,point:state.point!,rolls},round:null};
 const payout=state.outcome==='win'?source.stake*2n:0n;
 return {hand:null,round:{...source,point:state.point,rolls,outcome:state.outcome,payout,net:payout-source.stake}};
}
export function startDice(stake:bigint,explicitDice?:readonly [number,number]):DiceTurn {
 if(!isDiceStake(stake))throw new RangeError('Ставка должна быть положительным целым числом.');
 return result({id:crypto.randomUUID(),date:new Date().toISOString(),stake},[pair(explicitDice)]);
}
export function rollDice(hand:DiceHand,explicitDice?:readonly [number,number]):DiceTurn {
 if(!validateDiceHand(hand))throw new RangeError('Этот раунд уже завершён или повреждён.');
 return result({id:hand.id,date:hand.date,stake:hand.stake},[...hand.rolls.map(([a,b]):DicePair=>[a,b]),pair(explicitDice)]);
}
