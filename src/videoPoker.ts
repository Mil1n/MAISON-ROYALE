import { shuffledDeck, validCard, type Card } from './blackjack';

export type VideoPokerCategory = 'royal'|'straightFlush'|'four'|'full'|'flush'|'straight'|'three'|'twoPair'|'jacksOrBetter'|'loss';
export type VideoPokerHand = { id:string;date:string;stake:bigint;cards:Card[];deck:Card[] };
export type VideoPokerRound = { id:string;date:string;stake:bigint;initialCards:Card[];cards:Card[];held:number[];category:VideoPokerCategory;payout:bigint;net:bigint };
export const VIDEO_POKER_PAYTABLE:Record<VideoPokerCategory,{label:string;multiplier:number}> = {
 royal:{label:'Роял-флеш',multiplier:250}, straightFlush:{label:'Стрит-флеш',multiplier:50}, four:{label:'Каре',multiplier:25}, full:{label:'Фулл-хаус',multiplier:9}, flush:{label:'Флеш',multiplier:6}, straight:{label:'Стрит',multiplier:4}, three:{label:'Тройка',multiplier:3}, twoPair:{label:'Две пары',multiplier:2}, jacksOrBetter:{label:'Валеты и выше',multiplier:1}, loss:{label:'Нет комбинации',multiplier:0},
};
export const isVideoPokerStake=(value:unknown):value is bigint=>typeof value==='bigint'&&value>0n;
function identity(value:{id:string;date:string;stake:bigint}):boolean {return typeof value.id==='string'&&value.id.length>0&&value.id.length<100&&typeof value.date==='string'&&Number.isFinite(Date.parse(value.date))&&isVideoPokerStake(value.stake);}
function fiveCards(cards:readonly Card[]):boolean {return Array.isArray(cards)&&cards.length===5&&cards.every(validCard)&&new Set(cards).size===5;}
function heldValid(held:readonly number[]):boolean {return Array.isArray(held)&&held.length<=5&&held.every(i=>Number.isInteger(i)&&i>=0&&i<5)&&new Set(held).size===held.length;}

export function evaluateVideoPoker(cards:readonly Card[],stake:bigint):Pick<VideoPokerRound,'category'|'payout'|'net'> {
 if(!fiveCards(cards)||!isVideoPokerStake(stake))throw new RangeError('Нужны пять разных карт и положительная целая ставка.');
 const ranks=cards.map(card=>card%13), sorted=[...ranks].sort((a,b)=>a-b), counts=new Map<number,number>();
 ranks.forEach(rank=>counts.set(rank,(counts.get(rank)??0)+1));
 const groups=[...counts.values()].sort((a,b)=>b-a), flush=cards.every(card=>Math.floor(card/13)===Math.floor(cards[0]/13));
 // Ace can be low (A2345) or high (TJQKA), never wrap a middle straight.
 const royal=sorted.join(',')==='0,9,10,11,12';
 const straight=counts.size===5&&(royal||sorted.every((rank,i)=>i===0||rank===sorted[i-1]+1));
 let category:VideoPokerCategory='loss';
 if(flush&&royal)category='royal';else if(flush&&straight)category='straightFlush';else if(groups[0]===4)category='four';else if(groups[0]===3&&groups[1]===2)category='full';else if(flush)category='flush';else if(straight)category='straight';else if(groups[0]===3)category='three';else if(groups[0]===2&&groups[1]===2)category='twoPair';else if([...counts].some(([rank,count])=>count===2&&(rank===0||rank>=10)))category='jacksOrBetter';
 const payout=stake*BigInt(VIDEO_POKER_PAYTABLE[category].multiplier);
 return {category,payout,net:payout-stake};
}
export function validVideoPokerHand(hand:VideoPokerHand):boolean {
 try {const cards=[...hand.cards,...hand.deck];return identity(hand)&&fiveCards(hand.cards)&&hand.deck.length===47&&cards.every(validCard)&&new Set(cards).size===52;}catch{return false;}
}
export function validVideoPokerRound(round:VideoPokerRound):boolean {
 try {
  if(!identity(round)||!fiveCards(round.initialCards)||!fiveCards(round.cards)||!heldValid(round.held))return false;
  for(let i=0;i<5;i++) {
   if(round.held.includes(i)){if(round.cards[i]!==round.initialCards[i])return false;}
   else if(round.initialCards.includes(round.cards[i]))return false;
  }
  const actual=evaluateVideoPoker(round.cards,round.stake);
  return round.category===actual.category&&round.payout===actual.payout&&round.net===actual.net;
 }catch{return false;}
}
export function startVideoPoker(stake:bigint,explicitDeck?:readonly Card[]):VideoPokerHand {
 if(!isVideoPokerStake(stake))throw new RangeError('Ставка должна быть положительным целым числом.');
 const deck=explicitDeck?[...explicitDeck]:shuffledDeck();
 if(deck.length!==52||deck.some(card=>!validCard(card))||new Set(deck).size!==52)throw new RangeError('Нужна полная колода из 52 разных карт.');
 return {id:crypto.randomUUID(),date:new Date().toISOString(),stake,cards:deck.splice(0,5),deck};
}
export function drawVideoPoker(hand:VideoPokerHand,held:readonly number[]):VideoPokerRound {
 if(!validVideoPokerHand(hand)||!heldValid(held))throw new RangeError('Некорректная рука или выбор удерживаемых карт.');
 const deck=[...hand.deck],heldSet=new Set(held),cards=hand.cards.map((card,index)=>heldSet.has(index)?card:deck.shift()!);
 return {id:hand.id,date:hand.date,stake:hand.stake,initialCards:[...hand.cards],cards,held:[...held].sort((a,b)=>a-b),...evaluateVideoPoker(cards,hand.stake)};
}
