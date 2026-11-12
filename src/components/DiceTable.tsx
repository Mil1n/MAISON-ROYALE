import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Dice5, History, Play } from 'lucide-react';
import { isDiceStake, type DiceHand, type DicePair, type DiceRound } from '../dice';
import { money, parseMoneyInput } from '../game';
import '../dice.css';

export type DiceTableProps={
 balance:bigint;hand:DiceHand|null;rounds:DiceRound[];disabled:boolean;durationScale?:number;
 onStart:(stake:bigint)=>void;onRoll:()=>void;
 onPresentationChange?:(busy:boolean)=>void;onRoundRevealed?:(round:DiceRound)=>void;
};
type Display={hand:DiceHand|null;round:DiceRound|null};
const spots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function Die({face,rolling,index,duration}:{face:number|null;rolling:boolean;index:number;duration:number}){
 return <motion.div className={`dice-face ${rolling?'dice-face--rolling':''}`} role="img" aria-label={rolling?'Кость в движении':face===null?'Кость до броска':`Кость: ${face}`}
  animate={rolling?{y:[0,-36,0,-20,0],rotate:[0,index?220:-200,index?450:-430,index?650:-640,720],rotateX:[0,180,360,540,720],scale:[1,1.08,1,.98,1]}:{y:0,rotate:0,rotateX:0,scale:1}}
  transition={{duration:rolling?duration:0,ease:'easeOut'}}>
  {rolling||face===null?<span className="dice-unknown" aria-hidden="true">{rolling?'·':'?'}</span>:<span className="dice-pips" aria-hidden="true">{Array.from({length:9},(_,i)=><i key={i} className={spots[face].includes(i)?'is-pip':''}/>)}</span>}
 </motion.div>;
}
export function DiceTable({balance,hand,rounds,disabled,durationScale=1,onStart,onRoll,onPresentationChange,onRoundRevealed}:DiceTableProps){
 const reduced=Boolean(useReducedMotion());
 const [amount,setAmount]=useState('100'),[error,setError]=useState('');
 const last=rounds[0]??null;
 const [display,setDisplay]=useState<Display>(()=>({hand,round:last}));
 const [rolling,setRolling]=useState(false);
 const busy=useRef(false),callbacks=useRef({onPresentationChange,onRoundRevealed});callbacks.current={onPresentationChange,onRoundRevealed};
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),fallback=useRef<ReturnType<typeof setTimeout>|null>(null);
 const source=hand??last,key=source?`${source.id}:${source.rolls.map(p=>p.join(',')).join(';')}`:'empty';
 const previous=useRef(key);
 const scale=Number.isFinite(durationScale)?Math.max(.25,Math.min(3,durationScale)):1;
 const duration=1.35*scale;
 const setBusy=(value:boolean)=>{busy.current=value;setRolling(value);callbacks.current.onPresentationChange?.(value);};
 useLayoutEffect(()=>{
  if(previous.current===key)return;
  previous.current=key;if(fallback.current)clearTimeout(fallback.current);
  if(!source){setDisplay({hand:null,round:null});setBusy(false);return;}
  setBusy(true);
  const finish=()=>{setDisplay({hand,round:last});if(!hand&&last)callbacks.current.onRoundRevealed?.(last);setBusy(false);};
  if(reduced)finish();else timer.current=setTimeout(finish,duration*1000);
  return()=>{if(timer.current)clearTimeout(timer.current);};
 // An accepted throw owns its timing; ordinary parent renders do not restart it.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(fallback.current)clearTimeout(fallback.current);if(busy.current)callbacks.current.onPresentationChange?.(false);},[]);
 const act=(action:()=>void)=>{if(busy.current||disabled)return;setBusy(true);fallback.current=setTimeout(()=>setBusy(false),250);try{action();}catch(e){if(fallback.current)clearTimeout(fallback.current);setBusy(false);throw e;}};
 const visibleSource=display.hand??display.round;
 const pair:DicePair|null=visibleSource?.rolls.at(-1)??null;
 const complete=!rolling&&!hand&&last&&display.round?.id===last.id?last:null;
 const visibleRounds=!hand&&last&&!complete?rounds.filter(r=>r.id!==last.id):rounds;
 const sameRound=visibleSource?.id===source?.id;
 const point=rolling&&!sameRound?null:display.hand?.point??display.round?.point??null;
 const count=visibleSource?.rolls.length??0;
 const controlsDisabled=disabled||rolling;
 const selected=parseMoneyInput(amount);
 const net=visibleRounds.reduce((sum,r)=>sum+r.net,0n);
 const submit=(event:FormEvent)=>{
  event.preventDefault();if(controlsDisabled||hand)return;const stake=parseMoneyInput(amount);
  if(!isDiceStake(stake)){setError('Введите положительную целую сумму от 1 фишки.');return;}
  if(stake>balance){setError('Недостаточно фишек для этой ставки.');return;}
  setError('');act(()=>onStart(stake));
 };
 return <div className="dice-game" aria-busy={rolling}>
  <section className="dice-table" aria-label="Стол игры в кости Pass Line">
   <div className="dice-topline"><span>СТОЛ № 05 · CRAPS</span><span>PASS LINE · ВЫПЛАТА 1:1</span></div>
   <div className="dice-felt">
    <div className="dice-phase">{rolling?'КОСТИ В ДВИЖЕНИИ':display.hand?'ПОЙНТ УСТАНОВЛЕН':complete?'РАУНД ЗАВЕРШЁН':'ПЕРВЫЙ БРОСОК · COME-OUT'}</div>
    <div className="dice-pair"><Die face={pair?.[0]??null} rolling={rolling} index={0} duration={duration}/><Die face={pair?.[1]??null} rolling={rolling} index={1} duration={duration}/></div>
    <div className="dice-readout" aria-live="polite">{rolling?'Дождитесь остановки костей…':pair?<>Сумма <strong>{pair[0]+pair[1]}</strong> · бросок {count}</>:'Поставьте на Pass Line и бросьте кости'}</div>
    <div className={`dice-point ${display.hand?'is-active':''}`}><span>ПОЙНТ</span><strong>{point??'—'}</strong><p>{display.hand?'Повторите пойнт раньше семёрки. Ставка остаётся в игре.':'Первый бросок: 7 или 11 выигрывают; 2, 3 или 12 проигрывают.'}</p></div>
    <div className="dice-settlement" aria-live="polite">{complete?<><span>{complete.outcome==='win'?'Вы выиграли':'Ставка проиграла'}</span><strong className={complete.net>0n?'dice-positive':'dice-negative'}>{complete.net>0n?'+':''}{money(complete.net)} <small>фишек</small></strong><small>Возврат: {money(complete.payout)} · Ставка: {money(complete.stake)}</small></>:display.hand?<p>В игре: <b>{money(display.hand.stake)}</b> фишек</p>:null}</div>
   </div>
   <div className="dice-controls">{hand?<><p className="dice-active-note">{rolling?'Бросаем кости…':`Пойнт ${display.hand?.point??'…'}: бросайте снова без новой ставки.`}</p><button className="dice-primary" type="button" disabled={controlsDisabled} onClick={()=>act(onRoll)}><Dice5 size={18}/>Бросить ещё раз</button></>:<form onSubmit={submit} noValidate><div className="dice-stake"><label htmlFor="dice-stake">ВАША СТАВКА · PASS LINE</label><div className="dice-presets">{[20n,100n,500n,1000n].map(n=><button key={n.toString()} type="button" aria-pressed={selected===n} disabled={controlsDisabled} onClick={()=>{setAmount(n.toString());setError('');}}>{money(n)}</button>)}</div><div className="dice-input"><input id="dice-stake" aria-label="Сумма ставки в костях" aria-describedby="dice-stake-hint" aria-invalid={Boolean(error)} inputMode="numeric" type="text" autoComplete="off" disabled={controlsDisabled} value={amount} onChange={e=>{setAmount(e.target.value);setError('');}}/><span>фишек</span><button type="button" disabled={controlsDisabled||balance===0n} onClick={()=>setAmount(balance.toString())}>Максимум</button></div><p id="dice-stake-hint">От 1 фишки · ставка действует до победы или проигрыша</p>{error&&<p className="dice-error" role="alert">{error}</p>}</div><button className="dice-primary" type="submit" disabled={controlsDisabled}><Play size={17}/>{rolling?'Бросаем…':'Поставить и бросить'}</button></form>}</div>
  </section>
  <section className="dice-guide" aria-label="Правила Pass Line"><h3>Одна ставка. Два этапа.</h3><div><p><b>01 · Первый бросок</b><span>7 / 11 — победа. 2 / 3 / 12 — проигрыш. Любая другая сумма становится пойнтом.</span></p><p><b>02 · Игра на пойнт</b><span>Пойнт раньше 7 — победа. 7 раньше пойнта — проигрыш. Остальные суммы продолжают раунд.</span></p></div><small>Чистый выигрыш 1:1, ставка тоже возвращается. Обе кости честные; у каждой грани вероятность 1/6.</small></section>
  {visibleSource&&(!rolling||sameRound)&&<details className="dice-roll-log"><summary>Броски {display.hand?'текущего':'последнего'} раунда · {count}</summary><ol>{visibleSource.rolls.map(([a,b],i)=><li key={i}><span>#{i+1}</span> {a} + {b} <b>= {a+b}</b></li>)}</ol></details>}
  <section className="dice-session"><h3>Ваша сессия в костях</h3><div><p><span>Завершено раундов</span><strong>{visibleRounds.length}</strong></p><p><span>Побед</span><strong>{visibleRounds.filter(r=>r.outcome==='win').length}</strong></p><p><span>Чистый результат</span><strong className={net>0n?'dice-positive':net<0n?'dice-negative':''}>{net>0n?'+':''}{money(net)}</strong></p></div></section>
  <details className="dice-history"><summary><History size={16}/> История костей <span>{visibleRounds.length?'Последние 10 раундов':'Пока нет раундов'}</span></summary>{visibleRounds.length?<div className="dice-history-scroll"><table><thead><tr><th>Время</th><th>Ставка</th><th>Пойнт</th><th>Бросков</th><th>Итог</th></tr></thead><tbody>{visibleRounds.slice(0,10).map(r=><tr key={r.id}><td>{new Date(r.date).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td><td>{money(r.stake)}</td><td>{r.point??'—'}</td><td>{r.rolls.length}</td><td className={r.net>0n?'dice-positive':'dice-negative'}>{r.net>0n?'+':''}{money(r.net)}</td></tr>)}</tbody></table></div>:<p>Завершите первый раунд — здесь появится его итог.</p>}</details>
 </div>;
}
