import type { Money } from './game';

// One standard 52-card deck. Rank: A, 2..10, J, Q, K; suit: ♠, ♥, ♣, ♦.
export type Card = number;
export type BJOutcome = 'blackjack' | 'win' | 'loss' | 'push';
export type BJHand = {
 id:string; date:string; stake:Money;
 player:Card[]; dealer:Card[]; deck:Card[];
};
export type BJRound = {
 id:string; date:string; stake:Money;
 player:Card[]; dealer:Card[];
 outcome:BJOutcome; payout:Money; net:Money; doubled:boolean;
};
export type BJResult = { hand:BJHand; round:null } | { hand:null; round:BJRound };

export const validCard = (card:unknown):card is Card => typeof card==='number'&&Number.isInteger(card)&&card>=0&&card<52;
export const isBlackjackStake = (stake:unknown):stake is Money => typeof stake==='bigint'&&stake>=2n&&stake%2n===0n;
export const cardRank = (card:Card):string => ['A','2','3','4','5','6','7','8','9','10','J','Q','K'][card%13];
export const cardSuit = (card:Card):'♠'|'♥'|'♣'|'♦' => (['♠','♥','♣','♦'] as const)[Math.floor(card/13)];
export const cardLabel = (card:Card):string => `${cardRank(card)}${cardSuit(card)}`;

export function handValue(cards:readonly Card[]):{total:number;soft:boolean;natural:boolean;bust:boolean} {
 let total=0,aces=0;
 for(const card of cards){
  if(!validCard(card)) throw new RangeError('Некорректная карта.');
  const rank=card%13;
  if(rank===0){total+=11;aces++;}else total+=Math.min(rank+1,10);
 }
 while(total>21&&aces>0){total-=10;aces--;}
 return {total,soft:aces>0,natural:cards.length===2&&total===21,bust:total>21};
}

// An even initial stake pays a natural's 3:2 profit in whole virtual chips.
export function evaluateBlackjack(player:readonly Card[],dealer:readonly Card[],stake:Money,doubled=false):{outcome:BJOutcome;payout:Money;net:Money} {
 if(!isBlackjackStake(stake)) throw new RangeError('Ставка в блэкджеке должна быть чётным целым числом от 2.');
 const cards=[...player,...dealer];
 if(player.length<2||dealer.length<2||cards.some(card=>!validCard(card))||new Set(cards).size!==cards.length) throw new RangeError('Некорректные карты раунда.');
 const p=handValue(player),d=handValue(dealer),natural=p.natural&&!doubled;
 let outcome:BJOutcome;
 if(p.bust) outcome='loss';
 else if(d.natural) outcome=natural?'push':'loss';
 else if(natural) outcome='blackjack';
 else if(d.bust||p.total>d.total) outcome='win';
 else if(p.total<d.total) outcome='loss';
 else outcome='push';
 const payout=outcome==='blackjack'?stake*5n/2n:outcome==='win'?stake*2n:outcome==='push'?stake:0n;
 return {outcome,payout,net:payout-stake};
}

function randomIndex(size:number):number {
 const sample=new Uint32Array(1),limit=2**32-(2**32%size);
 do { crypto.getRandomValues(sample); } while(sample[0]>=limit);
 return sample[0]%size;
}
export function shuffledDeck():Card[] {
 const deck=Array.from({length:52},(_,i)=>i);
 for(let i=deck.length-1;i>0;i--){const j=randomIndex(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
 return deck;
}
function take(deck:Card[]):Card {
 const card=deck.shift();
 if(card===undefined) throw new Error('В колоде не осталось карт.');
 return card;
}
function assertActive(hand:BJHand):void {
 const all=[...hand.player,...hand.dealer,...hand.deck];
 if(!isBlackjackStake(hand.stake)||hand.player.length<2||hand.dealer.length!==2||handValue(hand.player).total>=21||handValue(hand.dealer).natural||all.length!==52||all.some(card=>!validCard(card))||new Set(all).size!==52) throw new Error('Эта рука недоступна для действия.');
}
function finish(hand:BJHand,doubled=false):BJResult {
 const dealer=[...hand.dealer],deck=[...hand.deck];
 // A player bust ends the round immediately; otherwise the dealer stands on all 17s.
 if(!handValue(hand.player).bust) while(handValue(dealer).total<17) dealer.push(take(deck));
 return {hand:null,round:{id:hand.id,date:hand.date,stake:hand.stake,player:[...hand.player],dealer,doubled,...evaluateBlackjack(hand.player,dealer,hand.stake,doubled)}};
}

// Optional explicit decks are full permutations of 0..51, dealt from the front
// in player, dealer, player, dealer order. Every action leaves its input intact.
export function startBlackjack(stake:Money,explicitDeck?:readonly Card[]):BJResult {
 if(!isBlackjackStake(stake)) throw new RangeError('Ставка в блэкджеке должна быть чётным целым числом от 2.');
 const deck=explicitDeck?[...explicitDeck]:shuffledDeck();
 if(deck.length!==52||deck.some(card=>!validCard(card))||new Set(deck).size!==52) throw new RangeError('Нужна полная колода из 52 разных карт.');
 const p1=take(deck),d1=take(deck),p2=take(deck),d2=take(deck);
 const hand:BJHand={id:crypto.randomUUID(),date:new Date().toISOString(),stake,player:[p1,p2],dealer:[d1,d2],deck};
 if(handValue(hand.player).natural||handValue(hand.dealer).natural){
  return {hand:null,round:{id:hand.id,date:hand.date,stake,player:hand.player,dealer:hand.dealer,doubled:false,...evaluateBlackjack(hand.player,hand.dealer,stake)}};
 }
 return {hand,round:null};
}
export function hitBlackjack(hand:BJHand):BJResult {
 assertActive(hand);
 const deck=[...hand.deck],player=[...hand.player,take(deck)],next={...hand,player,deck};
 return handValue(player).total>=21?finish(next):{hand:next,round:null};
}
export function standBlackjack(hand:BJHand):BJResult {
 assertActive(hand);
 return finish(hand);
}
export function doubleBlackjack(hand:BJHand):BJResult {
 assertActive(hand);
 if(hand.player.length!==2) throw new Error('Удвоение доступно только после первых двух карт.');
 const deck=[...hand.deck],player=[...hand.player,take(deck)];
 return finish({...hand,stake:hand.stake*2n,player,deck},true);
}
