import { describe, expect, it, vi } from 'vitest';
import { actHoldem, botAction, compareHoldem, evaluateHoldem, getLegalActions, holdemAwards, isHoldemStake,
  parseHoldemHand, parseHoldemRound, startHoldem, validHoldemHand, validHoldemRound,
  type HoldemHand, type HoldemSeat, type HoldemTurn } from './holdem';

const card = (value: string) => 'A23456789TJQK'.indexOf(value[0]) + 'SHCD'.indexOf(value[1]) * 13;
const cards = (value: string) => value.split(' ').map(card);
function deckWith(...first: number[]) { return [...first, ...Array.from({length:52},(_,i)=>i).filter(card=>!first.includes(card))]; }
const wire = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item));
const hand = (turn: HoldemTurn) => { expect(turn.hand).not.toBeNull(); return turn.hand!; };
function passive(turn: HoldemTurn): HoldemTurn {
  for (let i=0;turn.hand&&i<100;i++) turn=actHoldem(turn.hand,{type:getLegalActions(turn.hand).canCheck?'check':'call'});
  expect(turn.round).not.toBeNull(); return turn;
}

describe('Texas hold’em hand rankings', () => {
  it('orders all nine hand categories and includes the fifth-card kicker', () => {
    const examples = ['AS KD 9C 7H 3S', 'AS AD KC QH 3S', 'AS AD KC KH 3S', 'AS AD AC KH 3S', 'AS 2D 3C 4H 5S',
      'AS QS 9S 7S 3S', 'AS AD AC KH KS', 'AS AD AC AH KS', '9S TS JS QS KS'].map(value=>evaluateHoldem(cards(value)));
    expect(examples.map(value=>value.category)).toEqual([0,1,2,3,4,5,6,7,8]);
    for(let i=1;i<examples.length;i++) expect(compareHoldem(examples[i],examples[i-1])).toBeGreaterThan(0);
    expect(compareHoldem(evaluateHoldem(cards('AS AD KC QH 4S')),evaluateHoldem(cards('AH AC KD QS 3D')))).toBeGreaterThan(0);
  });
  it('uses the wheel as five-high and selects the best five from seven', () => {
    const wheel=evaluateHoldem(cards('AS 2D 3C 4H 5S KD QC'));
    expect(wheel.category).toBe(4); expect(wheel.ranks).toEqual([5]);
    expect(compareHoldem(evaluateHoldem(cards('2S 3D 4C 5H 6S')),wheel)).toBeGreaterThan(0);
    const twoTrips=evaluateHoldem(cards('AS AD AC KS KD KC 2S'));
    expect(twoTrips.category).toBe(6); expect(twoTrips.ranks).toEqual([14,13]);
    expect(evaluateHoldem(cards('AS KS QS JS TS 2D 3C')).ranks).toEqual([14]);
  });
  it('requires distinct real cards and at least five cards', () => {
    for(const value of [cards('AS AS KD QH JS'),cards('AS KD QH JS'),[0,1,2,3,52]]) expect(()=>evaluateHoldem(value)).toThrow();
  });
});

describe('no-limit betting and streets', () => {
  it('rotates button/blinds, deals one card per seat in order, and reserves only the blinds', () => {
    const h=hand(startHoldem(1000n,1,Array.from({length:52},(_,i)=>i)));
    expect(h.actor).toBe(1);expect(h.seats.map(s=>s.hole)).toEqual([[1,4],[2,5],[0,3]]);
    expect(h.seats.map(s=>s.stack)).toEqual([980n,1000n,990n]);
    expect(h.seats.map(s=>s.streetBet)).toEqual([20n,0n,10n]);
    expect(getLegalActions(h)).toMatchObject({toCall:20n,minRaiseTo:40n,maxRaiseTo:1000n,canCheck:false,canCall:true,canRaise:true});
    expect(validHoldemHand(h)).toBe(true);
  });
  it('retains the big blind option and completes all four betting rounds with burn cards', () => {
    let h=hand(startHoldem(1000n,0,Array.from({length:52},(_,i)=>i)));
    h=hand(actHoldem(h,{type:'call'}));h=hand(actHoldem(h,{type:'call'}));
    expect(h.actor).toBe(2);expect(h.street).toBe('preflop');expect(getLegalActions(h).canCheck).toBe(true);
    h=hand(actHoldem(h,{type:'check'}));expect(h.street).toBe('flop');expect(h.actor).toBe(1);expect(h.board).toEqual([7,8,9]);
    for(let i=0;i<3;i++)h=hand(actHoldem(h,{type:'check'}));
    expect(h.street).toBe('turn');expect(h.board).toEqual([7,8,9,11]);
    for(let i=0;i<3;i++)h=hand(actHoldem(h,{type:'check'}));
    expect(h.street).toBe('river');expect(h.board).toEqual([7,8,9,11,13]);
    const round=passive({hand:h,round:null}).round!;
    expect(round.street).toBe('showdown');expect(round.actions).toHaveLength(12);
    expect(round.seats.reduce((sum,s)=>sum+s.stack,0n)).toBe(3000n);
    expect(round.pot).toBe(60n);expect(validHoldemRound(round)).toBe(true);
  });
  it('requires full raises, reopens action after raising, and rejects illegal actions without mutation', () => {
    const original=hand(startHoldem(1000n));const source=wire(original);
    expect(()=>actHoldem(original,{type:'check'})).toThrow();
    expect(()=>actHoldem(original,{type:'raise',amount:30n})).toThrow();
    expect(wire(original)).toEqual(source);
    let h=hand(actHoldem(original,{type:'raise',amount:60n}));
    expect(h.minRaise).toBe(40n);expect(h.pending).toEqual([1,2]);
    h=hand(actHoldem(h,{type:'raise',amount:100n}));expect(h.pending).toEqual([2,0]);
    h=hand(actHoldem(h,{type:'call'}));expect(h.actor).toBe(0);expect(getLegalActions(h).minRaiseTo).toBe(140n);
    expect(()=>actHoldem(h,{type:'raise',amount:120n})).toThrow();
    h=hand(actHoldem(h,{type:'call'}));expect(h.street).toBe('flop');expect(h.seats.map(s=>s.contribution)).toEqual([100n,100n,100n]);
  });
  it('does not reopen raising after one short all-in, but cumulative full increments do reopen', () => {
    const h=hand(startHoldem(1000n));
    h.actor=0;h.bet=130n;h.minRaise=100n;h.actedAt[0]=100n;h.seats[0].streetBet=100n;
    expect(getLegalActions(h).canRaise).toBe(false);
    h.bet=200n;expect(getLegalActions(h).canRaise).toBe(true);
    h.actedAt[0]=null;h.bet=130n;expect(getLegalActions(h).canRaise).toBe(true);
  });
  it('accepts a short all-in and runs out the board when no further betting is possible', () => {
    let h=hand(startHoldem(200n));
    h=hand(actHoldem(h,{type:'raise',amount:100n}));h=hand(actHoldem(h,{type:'call'}));h=hand(actHoldem(h,{type:'call'}));
    h=hand(actHoldem(h,{type:'check'}));h=hand(actHoldem(h,{type:'raise',amount:60n}));
    h=hand(actHoldem(h,{type:'raise',amount:100n}));expect(h.minRaise).toBe(60n);
    h=hand(actHoldem(h,{type:'call'}));
    const result=actHoldem(h,{type:'call'});
    expect(result.hand).toBeNull();expect(result.round!.board).toHaveLength(5);
    expect(result.round!.pot).toBe(600n);expect(result.round!.seats.reduce((sum,s)=>sum+s.stack,0n)).toBe(600n);
  });
  it('awards an uncontested pot without revealing or drawing the board', () => {
    let h=hand(startHoldem(1000n));h=hand(actHoldem(h,{type:'raise',amount:100n}));h=hand(actHoldem(h,{type:'fold'}));
    const result=actHoldem(h,{type:'fold'}).round!;
    expect(result.street).toBe('fold');expect(result.board).toEqual([]);expect(result.winners).toEqual([0]);
    expect(result.payout).toBe(1030n);expect(result.net).toBe(30n);expect(result.pot).toBe(130n);
  });
  it('validates stakes and explicit decks', () => {
    expect([0n,199n,200n,201n].map(isHoldemStake)).toEqual([false,false,true,true]);
    expect(()=>startHoldem(199n)).toThrow();expect(()=>startHoldem(1000n,3)).toThrow();
    expect(()=>startHoldem(1000n,0,Array(52).fill(0))).toThrow();
  });
});

describe('side pots and split pots', () => {
  const seat=(id:number,hole:string,contribution:bigint,folded=false):HoldemSeat=>({id,name:String(id),hole:cards(hole),contribution,stack:1000n-contribution,streetBet:0n,folded,allIn:false});
  const board=cards('2C 3D 7H 9S JC');
  it('limits each all-in to eligible pots and refunds an unmatched contribution', () => {
    const seats=[seat(0,'AS AH',100n),seat(1,'KS KH',200n),seat(2,'QS QH',300n)];
    expect(holdemAwards(seats,board,0)).toEqual([300n,200n,100n]);
  });
  it('includes folded contributions but never awards their stronger cards', () => {
    const seats=[seat(0,'AS AH',200n,true),seat(1,'KS KH',200n),seat(2,'QS QH',200n)];
    expect(holdemAwards(seats,board,0)).toEqual([0n,600n,0n]);
  });
  it('splits exact chips and gives odd chips clockwise from left of button', () => {
    const seats=[seat(0,'2H 3H',5n),seat(1,'4H 5H',5n,true),seat(2,'6H 7H',5n)];
    const shared=cards('AS KS QS JS TS');
    expect(holdemAwards(seats,shared,0)).toEqual([7n,0n,8n]);
    expect(holdemAwards(seats,shared,2)).toEqual([8n,0n,7n]);
  });
});

describe('saved hands, bots and replay', () => {
  it('round-trips an interrupted street and exact huge stacks without changing the next move', () => {
    const h=hand(startHoldem(10n**80n));
    const advanced=hand(actHoldem(h,{type:'raise',amount:10n**50n}));
    expect(parseHoldemHand(wire(advanced))).toEqual(advanced);
    const restored=parseHoldemHand(wire(advanced));
    expect(actHoldem(restored,{type:'call'})).toEqual(actHoldem(advanced,{type:'call'}));
  });
  it('rejects forged money, holes, board, action order and betting rights', () => {
    const h=hand(startHoldem(1000n));
    const corruptions=[(s:any)=>s.seats[0].stack='1001',(s:any)=>s.seats[1].hole=[0,0],(s:any)=>s.actor=2,
      (s:any)=>s.pending=[2],(s:any)=>s.bet='1',(s:any)=>s.actedAt[0]='0',(s:any)=>s.board=[9],(s:any)=>s.cursor=10];
    for(const corrupt of corruptions){const source=wire(h);corrupt(source);expect(()=>parseHoldemHand(source)).toThrow();}
    const played=hand(actHoldem(h,{type:'call'})),source=wire(played);source.actions[0].seat=2;
    expect(()=>parseHoldemHand(source)).toThrow();
  });
  it('validates saved terminal results from actions, rejecting duplicated payouts and forged winners', () => {
    const round=passive(startHoldem(1000n)).round!;
    expect(parseHoldemRound(wire(round))).toEqual(round);
    for(const change of [{payout:(round.payout+1n).toString()},{net:'999'},{awards:['0','0','0']},{winners:[]}])
      expect(()=>parseHoldemRound({...wire(round),...change})).toThrow();
    expect(()=>parseHoldemRound(wire(hand(startHoldem(1000n))))).toThrow();
  });
  it('finishes representative bot games and conserves all three stacks', () => {
    for(let attempt=0;attempt<12;attempt++){
      let turn=startHoldem(1000n,attempt%3);
      for(let i=0;turn.hand&&i<250;i++)turn=actHoldem(turn.hand,botAction(turn.hand));
      expect(turn.round).not.toBeNull();expect(validHoldemRound(turn.round)).toBe(true);
      expect(turn.round!.seats.reduce((sum,s)=>sum+s.stack,0n)).toBe(3000n);
    }
  });
  it('survives 180 mixed no-limit hands across every button with exact chip conservation', () => {
    let state=7931;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
    for(let attempt=0;attempt<180;attempt++){
      const stake=200n+BigInt(attempt*7);
      let turn=startHoldem(stake,attempt%3),moves=0;
      while(turn.hand&&moves++<500){
        const legal=getLegalActions(turn.hand),chance=random();
        if(chance<.06)turn=actHoldem(turn.hand,{type:'fold'});
        else if(chance<.43&&legal.canRaise){
          const target=random()<.25||legal.maxRaiseTo<legal.minRaiseTo?legal.maxRaiseTo:legal.minRaiseTo;
          turn=actHoldem(turn.hand,{type:'raise',amount:target});
        }else turn=actHoldem(turn.hand,{type:legal.canCheck?'check':'call'});
        const seats=(turn.hand??turn.round).seats;
        expect(seats.every(seat=>seat.stack>=0n&&seat.contribution>=0n)).toBe(true);
        expect(seats.reduce((sum,seat)=>sum+seat.stack+(turn.hand?seat.contribution:0n),0n)).toBe(stake*3n);
      }
      expect(moves).toBeLessThan(500);expect(turn.round).not.toBeNull();
      expect(parseHoldemRound(wire(turn.round))).toEqual(turn.round);
      if(turn.round!.street==='showdown')expect(turn.round!.board).toHaveLength(5);
    }
  });
  it('bots base choices on their own cards and visible board, regardless of hidden cards', () => {
    const h=hand(startHoldem(1000n,1));
    const changed=structuredClone(h);changed.seats[0].hole=[51,50];changed.deck.reverse();
    const random=vi.spyOn(Math,'random').mockReturnValue(.2);
    expect(botAction(changed)).toEqual(botAction(h));random.mockRestore();
  });
});
