import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cardLabel, cardRank, cardSuit, type Card } from '../blackjack';
import { isVideoPokerStake, VIDEO_POKER_PAYTABLE, type VideoPokerHand, type VideoPokerRound } from '../videoPoker';
import { money, parseMoneyInput } from '../game';
import '../videoPoker.css';

type Props={balance:bigint;hand:VideoPokerHand|null;rounds:VideoPokerRound[];disabled:boolean;durationScale?:number;onDeal:(stake:bigint)=>void;onDraw:(held:number[])=>void;onPresentationChange?:(busy:boolean)=>void;onRoundRevealed?:(round:VideoPokerRound)=>void};
export function VideoPokerTable({balance,hand,rounds,disabled,durationScale=1,onDeal,onDraw,onPresentationChange,onRoundRevealed}:Props){
 const reduced=Boolean(useReducedMotion()),scale=Number.isFinite(durationScale)?Math.max(.25,Math.min(3,durationScale)):1,last=rounds[0]??null,source=hand??last;
 const [shown,setShown]=useState<(Card|null)[]>(source?.cards??[null,null,null,null,null]);
 const [presentation,setPresentation]=useState({id:source?.id??'',round:!hand&&Boolean(last)});
 const [animating,setAnimating]=useState(false),[held,setHeld]=useState<number[]>([]),[amount,setAmount]=useState('100'),[error,setError]=useState('');
 const busy=useRef(false),key=source?`${source.id}:${hand?'hand':'round'}`:'empty',previous=useRef(key),timers=useRef<ReturnType<typeof setTimeout>[]>([]),fallback=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const callbacks=useRef({onPresentationChange,onRoundRevealed});callbacks.current={onPresentationChange,onRoundRevealed};
 const setBusy=(value:boolean)=>{busy.current=value;setAnimating(value);callbacks.current.onPresentationChange?.(value);};
 useLayoutEffect(()=>{
  if(previous.current===key)return;previous.current=key;clearTimeout(fallback.current);timers.current.forEach(clearTimeout);timers.current=[];
  if(!source){setShown([null,null,null,null,null]);setPresentation({id:'',round:false});setHeld([]);setBusy(false);return;}
  setPresentation({id:source.id,round:false});setBusy(true);
  const retained=hand?[]:last!.held;setHeld([...retained]);
  let cards:(Card|null)[]=source.cards.map((card,index)=>!hand&&retained.includes(index)?card:null);setShown(cards);
  const replace=[0,1,2,3,4].filter(index=>hand||!retained.includes(index));
  const finish=()=>{setShown([...source.cards]);setPresentation({id:source.id,round:!hand});if(!hand&&last)callbacks.current.onRoundRevealed?.(last);setBusy(false);};
  if(reduced){finish();return;}
  replace.forEach((cardIndex,index)=>timers.current.push(setTimeout(()=>{cards=[...cards];cards[cardIndex]=source.cards[cardIndex];setShown(cards);},(100+index*350)*scale)));
  timers.current.push(setTimeout(finish,(replace.length?100+(replace.length-1)*350+430:240)*scale));
  return()=>{timers.current.forEach(clearTimeout);timers.current=[];};
  // Each accepted hand/draw owns its timeline; controls lock settings while it runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 useEffect(()=>()=>{timers.current.forEach(clearTimeout);clearTimeout(fallback.current);if(busy.current)callbacks.current.onPresentationChange?.(false);},[]);
 const visibleLast=!hand&&last&&presentation.id===last.id&&presentation.round&&!animating?last:null;
 const visibleRounds=!hand&&last&&!visibleLast?rounds.filter(round=>round.id!==last.id):rounds;
 const locked=disabled||animating,selected=parseMoneyInput(amount),id=useId(),net=visibleRounds.reduce((sum,round)=>sum+round.net,0n);
 function act(action:()=>void){if(locked||busy.current)return;setBusy(true);fallback.current=setTimeout(()=>setBusy(false),250);try{action();}catch(cause){clearTimeout(fallback.current);setBusy(false);throw cause;}}
 function deal(event:FormEvent<HTMLFormElement>){event.preventDefault();if(locked||hand)return;const stake=parseMoneyInput(amount);if(!isVideoPokerStake(stake)){setError('Введите положительное целое число фишек.');return;}if(stake>balance){setError('Недостаточно фишек для этой ставки.');return;}setError('');act(()=>onDeal(stake));}
 const toggle=(index:number)=>{if(!hand||locked)return;setHeld(current=>current.includes(index)?current.filter(i=>i!==index):[...current,index].sort());};
 return <div className="video-poker" aria-busy={animating} data-presentation={animating?'dealing':hand?'holding':'complete'}>
  <section className="vp-table" aria-label="Игровой стол видеопокера">
   <div className="vp-topline"><span><i/> СТОЛ № 04 · VIDEO POKER</span><span>JACKS OR BETTER · 9 / 6</span></div>
   <div className="vp-layout"><aside className="vp-paytable" aria-label="Таблица выплат"><h3>JACKS OR BETTER</h3><p>Возврат за 1 фишку ставки</p>{Object.entries(VIDEO_POKER_PAYTABLE).filter(([category])=>category!=='loss').map(([category,item])=><div key={category} className={visibleLast?.category===category?'is-winning':''}><span>{item.label}</span><strong>×{item.multiplier}</strong></div>)}<small>Множитель включает ставку.<br/>Роял-флеш: ×250 при любой ставке.</small></aside>
    <div className="vp-felt"><div className="vp-inscription" aria-hidden="true"><span>MAISON ROYALE</span><strong>JACKS OR BETTER</strong><small>ПЯТЬ КАРТ · ОДИН ОБМЕН · ВАШ ВЫБОР</small></div>
     <div className="vp-cards" aria-label="Ваши пять карт">{shown.map((card,index)=>{
      const suit=card===null?'':cardSuit(card),red=suit==='♥'||suit==='♦';
      return <button key={index} type="button" className={`vp-card-choice ${held.includes(index)?'is-held':''}`} disabled={!hand||locked||card===null} aria-pressed={held.includes(index)} aria-label={card===null?`Карта ${index+1}: ожидает раздачи`:`${cardLabel(card)} — ${held.includes(index)?'удерживается':'нажмите, чтобы удержать'}`} onClick={()=>toggle(index)}>
       <motion.span key={`${presentation.id}-${index}-${card}`} className={`vp-card ${card===null?'vp-card--back':red?'vp-card--red':''}`} initial={card===null||reduced?false:{opacity:0,y:-22,rotateY:-65}} animate={{opacity:1,y:0,rotateY:0}} transition={{duration:reduced?0:.32*scale,ease:'easeOut'}}>
        {card===null?<span className="vp-card__back" aria-hidden="true">MR</span>:<><span className="vp-card__corner" aria-hidden="true"><b>{cardRank(card)}</b>{suit}</span><span className="vp-card__suit" aria-hidden="true">{suit}</span><span className="vp-card__corner vp-card__corner--bottom" aria-hidden="true"><b>{cardRank(card)}</b>{suit}</span></>}
       </motion.span><span className="vp-hold">{held.includes(index)?'ДЕРЖАТЬ':hand?'ВЫБРАТЬ':'—'}</span>
      </button>;
     })}</div>
     <div className="vp-settlement" aria-live="polite">{animating?<p>Раздаём карты по очереди…<small>Итог появится, когда все карты лягут на стол</small></p>:hand?<p>Какие карты оставим?<small>Нажмите на карты для удержания. Остальные заменятся один раз.</small></p>:visibleLast?<div className="vp-result"><span>{VIDEO_POKER_PAYTABLE[visibleLast.category].label}</span><strong className={visibleLast.net>0n?'positive':visibleLast.net<0n?'negative':''}>{visibleLast.net>0n?'+':''}{money(visibleLast.net)} <small>фишек</small></strong><small>Возврат: {money(visibleLast.payout)} · Ставка: {money(visibleLast.stake)}</small></div>:<p>Валеты и выше — уже результат<small>Сделайте ставку и получите пять карт</small></p>}</div>
     {hand&&<div className="vp-draw-controls"><p>В игре: <strong>{money(hand.stake)}</strong> фишек <span>Удержано: {held.length} из 5</span></p><div><button type="button" disabled={locked} onClick={()=>setHeld(held.length===5?[]:[0,1,2,3,4])}>{held.length===5?'Снять удержание':'Удержать все'}</button><button className="vp-gold" type="button" disabled={locked} onClick={()=>act(()=>onDraw(held))}>{held.length===5?'Оставить все карты':`Обменять ${5-held.length} карт`} <span>→</span></button></div></div>}
    </div>
   </div>
   {!hand&&<form className="vp-controls" onSubmit={deal}><div className="vp-stake"><label htmlFor={id}>ВАША СТАВКА</label><div className="vp-presets">{[10n,100n,500n,1000n].map(stake=><button type="button" key={stake.toString()} disabled={locked} aria-pressed={selected===stake} onClick={()=>setAmount(stake.toString())}>{money(stake)}</button>)}</div><div className="vp-input"><input id={id} type="text" inputMode="numeric" value={amount} disabled={locked} aria-describedby={`${id}-hint`} onChange={e=>{setAmount(e.target.value);setError('');}}/><span>фишек</span><button type="button" disabled={locked||balance<=0n} onClick={()=>{setAmount(balance.toString());setError('');}}>Максимум</button></div><p id={`${id}-hint`}>От 1 фишки · одна ставка за всю раздачу и обмен</p></div><button className="vp-gold vp-deal" disabled={locked||!isVideoPokerStake(selected)||selected>balance}>{animating?'Раздаём карты…':'Раздать 5 карт'} <span>→</span></button>{error&&<p className="vp-error" role="alert">{error}</p>}</form>}
  </section>
  <section className="vp-session" aria-label="Статистика видеопокера"><h3>Ваша сессия в видеопокере</h3><div><p><span>Раздач</span><strong>{visibleRounds.length}</strong></p><p><span>Сыгравших комбинаций</span><strong>{visibleRounds.filter(round=>round.payout>0n).length}</strong></p><p><span>Чистый результат</span><strong className={net>0n?'positive':net<0n?'negative':''}>{net>0n?'+':''}{money(net)}</strong></p></div></section>
  <details className="vp-history"><summary>История видеопокера <span>{visibleRounds.length?`${visibleRounds.length} раздач`:'Пока нет раздач'}</span></summary>{visibleRounds.length?<div className="vp-history__scroll"><table><thead><tr><th>Время</th><th>Ставка</th><th>Комбинация</th><th>Итог</th></tr></thead><tbody>{visibleRounds.slice(0,100).map(round=><tr key={round.id}><td>{new Date(round.date).toLocaleString('ru-RU')}</td><td>{money(round.stake)}</td><td>{VIDEO_POKER_PAYTABLE[round.category].label}<small>{round.cards.map(cardLabel).join(' ')}</small></td><td className={round.net>0n?'positive':round.net<0n?'negative':''}>{round.net>0n?'+':''}{money(round.net)}<small>Возврат: {money(round.payout)}</small></td></tr>)}</tbody></table>{visibleRounds.length>100&&<p>Показаны последние 100 раздач. Полная история доступна в экспорте JSON.</p>}</div>:<p>Завершите первую раздачу — она появится здесь.</p>}</details>
  <p className="vp-note">В каждой раздаче новая колода из 52 карт. Сброшенные карты не возвращаются при обмене. Незавершённую руку можно продолжить после перезагрузки.</p>
 </div>;
}
