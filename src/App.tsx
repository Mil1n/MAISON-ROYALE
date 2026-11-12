import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, CircleHelp, Coins, History, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, Undo2, Volume2, VolumeX, X, BarChart3, ArrowUpRight } from 'lucide-react';
import { BettingTable } from './components/BettingTable';
import { Wheel } from './components/Wheel';
import { Withdrawal } from './components/Withdrawal';
import { BlackjackTable } from './components/BlackjackTable';
import { BaccaratTable } from './components/BaccaratTable';
import { VideoPokerTable } from './components/VideoPokerTable';
import { DiceTable } from './components/DiceTable';
import { HoldemTable } from './components/HoldemTable';
import { AddedGameRules } from './components/AddedGameRules';
import { startVideoPoker, drawVideoPoker, isVideoPokerStake } from './videoPoker';
import { startDice, rollDice, isDiceStake } from './dice';
import { startHoldem, actHoldem, botAction, type HoldemAction } from './holdem';
import { BalanceChart } from './components/BalanceChart';
import { isBaccaratStake, playBaccarat, type BaccaratBet, type BaccaratRound } from './baccarat';
import { startBlackjack, hitBlackjack, standBlackjack, doubleBlackjack, isBlackjackStake, type BJHand, type BJRound } from './blackjack';
import { withdrawalImage } from './withdrawalImage';
import { betName, color, colorName, money, parseMoneyInput, nextRotation, payout, randomNumber, total, type Round, type Pocket } from './game';
import { initial, load, parseSave, persist, recover, stringifySave, recordBalance, type Save } from './storage';
import { sound } from './audio';
import { useAutoSpin } from './useAutoSpin';
import { SPIN_DURATION } from './ballMotion';
const chips=[10,50,100,500,1000,5000,10000,50000,100000];
const loaded=load();
const gameTabs=[{id:'roulette',label:'Рулетка',icon:'◉'},{id:'blackjack',label:'Блэкджек · 21',icon:'♠'},{id:'baccarat',label:'Баккара',icon:'♦'},{id:'videopoker',label:'Видеопокер',icon:'♣'},{id:'dice',label:'Кости',icon:'⚄'},{id:'holdem',label:'Холдем',icon:'♥'}] as const;
const customAmount=parseMoneyInput;
const readableMoney=(value:bigint|number)=>money(value).replace(/[\u00a0\u202f]/g,' ');
type AddedGame='videopoker'|'dice'|'holdem';
type Settlement={id:string;payout:bigint;net:bigint};
const addedLabels:Record<AddedGame,string>={videopoker:'Видеопокер',dice:'Кости',holdem:'Техасский холдем'};
const hasActiveHand=(s:Save)=>Boolean(s.blackjack.hand||s.videopoker.hand||s.dice.hand||s.holdem.hand);
type Modal='balance'|'history'|'stats'|'rules'|'withdraw'|null;
export default function App(){
 const [save,setSave]=useState<Save>(loaded.save);const current=useRef(save);
 const [chip,setChip]=useState(100n);const [amountMode,setAmountMode]=useState<'chip'|'custom'|'allin'>('chip');const [customBet,setCustomBet]=useState('');const [rotation,setRotation]=useState(0);const [spinning,setSpinning]=useState(false);const busy=useRef(false);
 const [ballPocket,setBallPocket]=useState<Pocket>(0);const [result,setResult]=useState<Pocket|null>(null);const [toast,setToast]=useState(loaded.warning);const [modal,setModal]=useState<Modal>(null);const [custom,setCustom]=useState('');const [reset,setReset]=useState(false);const input=useRef<HTMLInputElement>(null);const timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [storageError,setStorageError]=useState(false);
 const [blackjackAnimating,setBlackjackAnimating]=useState(false),[blackjackPayout,setBlackjackPayout]=useState(0n);
 const blackjackBusy=useRef(false),blackjackResult=useRef<BJRound|null>(null);
 const onBlackjackPresentation=useCallback((value:boolean)=>{blackjackBusy.current=value;setBlackjackAnimating(value);},[]);
 const onBlackjackRevealed=useCallback((round:BJRound)=>{
  if(blackjackResult.current?.id!==round.id)return;
  blackjackResult.current=null;setBlackjackPayout(0n);
  setToast(`${round.outcome==='blackjack'?'Блэкджек!':round.outcome==='win'?'Вы выиграли':round.outcome==='push'?'Ничья':'Раунд проигран'} · ${round.net>0n?'+':''}${money(round.net)} фишек`);
  sound(round.net>0n?'win':'lose',current.current.sound);
 },[]);
 const [baccaratAnimating,setBaccaratAnimating]=useState(false),[baccaratPayout,setBaccaratPayout]=useState(0n);
 const baccaratBusy=useRef(false),baccaratResult=useRef<BaccaratRound|null>(null);
 const onBaccaratPresentation=useCallback((value:boolean)=>{baccaratBusy.current=value;setBaccaratAnimating(value);},[]);
 const onBaccaratRevealed=useCallback((round:BaccaratRound)=>{
  if(baccaratResult.current?.id!==round.id)return;
  baccaratResult.current=null;setBaccaratPayout(0n);
  setToast(`Баккара · ${round.winner==='player'?'Игрок':round.winner==='banker'?'Банкир':'Ничья'} · ${round.net>0n?'+':''}${money(round.net)} фишек`);
  sound(round.net>0n?'win':'lose',current.current.sound);
 },[]);
 const [addedAnimating,setAddedAnimating]=useState(false),[addedPayout,setAddedPayout]=useState(0n);
 const addedBusy=useRef(false),addedResult=useRef<{game:AddedGame;round:Settlement}|null>(null);
 const onAddedPresentation=useCallback((value:boolean)=>{addedBusy.current=value;setAddedAnimating(value);},[]);
 const onAddedRevealed=useCallback((round:Settlement)=>{
  const result=addedResult.current;if(result?.round.id!==round.id)return;
  addedResult.current=null;setAddedPayout(0n);
  setToast(`${addedLabels[result.game]} · ${round.net>0n?'+':''}${money(round.net)} фишек`);
  sound(round.net>0n?'win':'lose',current.current.sound);
 },[]);
 const activeHand=hasActiveHand(save);
 const cardAnimating=blackjackAnimating||baccaratAnimating||addedAnimating;
 const durationScale=save.animationSpeed==='slow'?1.5:save.animationSpeed==='fast'?.6:1;
 const displayedBalance=save.balance-blackjackPayout-baccaratPayout-addedPayout;
 const auto=useAutoSpin(save.activeGame==='roulette'&&save.autoSpin&&save.bets.length>0&&!spinning&&modal!=='withdraw',spin);
 const selectedAmount=amountMode==='allin'?save.balance:amountMode==='custom'?customAmount(customBet):chip;
 const dialogRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(!modal)return;const previous=document.activeElement as HTMLElement|null;const handler=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const items=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');if(!items?.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};},[modal]);
 const commit=(s:Save,required=false)=>{const ok=persist(s);setStorageError(!ok);if(!ok&&required){setToast('Не удалось сохранить раунд. Освободите место в хранилище браузера.');return false;}current.current=s;setSave(s);return true;};
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),6500);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>()=>{if(timeout.current)clearTimeout(timeout.current);},[]);
 useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setModal(null);setReset(false);}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
 function place(id:string){
  const s=current.current;if(busy.current||hasActiveHand(s)||s.activeGame!=='roulette')return;
  const amount=amountMode==='allin'?s.balance:amountMode==='custom'?customAmount(customBet):chip;
  if(amount===null||amount<=0n){setToast('Введите положительную целую сумму ставки.');return;}
  if(s.bets.length>=2000){setToast('Достигнут лимит фишек на раунд.');return;}
  if(s.balance<amount){setToast('Недостаточно фишек. Уменьшите сумму или пополните баланс.');return;}
  const bets=[...s.bets,{id,amount}];
  commit({...s,balance:s.balance-amount,bets});if(s.autoSpin&&s.bets.length>0&&auto.seconds===null)auto.restart();setResult(null);sound('chip',s.sound);
 }
 function clear(){const s=current.current;if(busy.current||!s.bets.length)return;auto.cancel();commit({...s,balance:s.balance+total(s.bets),bets:[]});}
 function undo(){const s=current.current;if(busy.current||!s.bets.length)return;const b=s.bets.at(-1)!;commit({...s,balance:s.balance+b.amount,bets:s.bets.slice(0,-1)});if(s.autoSpin&&s.bets.length>1&&auto.seconds===null)auto.restart();}
 function repeat(){const s=current.current;if(busy.current)return;if(!s.lastBets.length){setToast('Сначала сыграйте один раунд.');return;}const available=s.balance+total(s.bets),stake=total(s.lastBets);if(stake>available){setToast('Недостаточно средств для повторения ставки.');return;}commit({...s,balance:available-stake,bets:s.lastBets.map(b=>({...b}))});if(s.autoSpin&&s.bets.length>0&&auto.seconds===null)auto.restart();setResult(null);sound('chip',s.sound);}
 function finish(){if(!busy.current)return;const s=current.current,r=s.pending;if(!r)return;if(timeout.current)clearTimeout(timeout.current);commit(recordBalance(s,{...s,balance:s.balance+r.payout,pending:null,rounds:[r,...s.rounds].slice(0,10000)},'roulette',r.id));busy.current=false;setSpinning(false);setResult(r.number);setToast(`${r.number} · ${colorName(r.number)}. ${r.payout?`Возврат ${money(r.payout)} · итог ${r.net>=0n?'+':''}${money(r.net)}`:`Ставка не сыграла · ${money(r.net)}`}`);sound(r.net>0n?'win':'lose',s.sound);}
 function spin(){const s=current.current;if(busy.current||hasActiveHand(s)||s.activeGame!=='roulette'||!s.bets.length)return;auto.cancel();const n=randomNumber(),stake=total(s.bets),paid=payout(s.bets,n);const round:Round={id:crypto.randomUUID(),date:new Date().toISOString(),number:n,bets:s.bets.map(b=>({...b})),stake,payout:paid,net:paid-stake};if(!commit({...s,lastBets:s.bets,bets:[],pending:round},true))return;busy.current=true;setSpinning(true);setResult(null);setRotation(r=>nextRotation(r));setBallPocket(n);sound('spin',s.sound);timeout.current=setTimeout(finish,SPIN_DURATION*durationScale*1000+200);}
 function chooseGame(game:Save['activeGame']){
  const s=current.current;if(busy.current||blackjackBusy.current||baccaratBusy.current||addedBusy.current||hasActiveHand(s)||s.activeGame===game)return;
  auto.cancel();commit({...s,activeGame:game});
  if(game!=='roulette'&&s.bets.length)setToast('Ставки на рулетке сохранены. Отсчёт продолжится после возвращения.');
 }
 function saveBlackjackTurn(s:Save,turn:{hand:BJHand|null;round:BJRound|null},reserved:bigint){
  if(reserved<0n||reserved>s.balance)return;
  const balance=s.balance-reserved+(turn.round?.payout??0n);
  const blackjack={hand:turn.hand,rounds:turn.round?[turn.round,...s.blackjack.rounds].slice(0,10000):s.blackjack.rounds};
  const next:Save={...s,balance,blackjack,activeGame:'blackjack'};
  if(!commit(turn.round?recordBalance(s,next,'blackjack',turn.round.id):next,true))return;
  if(turn.round){blackjackResult.current=turn.round;setBlackjackPayout(turn.round.payout);setToast('');}
  else sound('chip',s.sound);
 }
 function dealBlackjack(stake:bigint){
  const s=current.current;if(busy.current||hasActiveHand(s)||s.activeGame!=='blackjack')return;
  if(!isBlackjackStake(stake)){setToast('Для блэкджека выберите ставку от 2 фишек, кратную 2.');return;}
  if(stake>s.balance){setToast('Недостаточно фишек для этой ставки.');return;}
  saveBlackjackTurn(s,startBlackjack(stake),stake);
 }
 function actBlackjack(action:'hit'|'stand'|'double'){
  const s=current.current,h=s.blackjack.hand;if(busy.current||!h||s.activeGame!=='blackjack')return;
  if(action==='double'&&(h.player.length!==2||s.balance<h.stake)){setToast('Удвоение доступно на первых двух картах при достаточном балансе.');return;}
  const turn=action==='hit'?hitBlackjack(h):action==='stand'?standBlackjack(h):doubleBlackjack(h);
  saveBlackjackTurn(s,turn,action==='double'?h.stake:0n);
 }
 function dealBaccarat(stake:bigint,bet:BaccaratBet){
  const s=current.current;if(busy.current||hasActiveHand(s)||s.activeGame!=='baccarat')return;
  if(!isBaccaratStake(stake)){setToast('Для баккары выберите ставку от 20 фишек, кратную 20.');return;}
  if(stake>s.balance){setToast('Недостаточно фишек для этой ставки.');return;}
  const round=playBaccarat(stake,bet);
  const next:Save={...s,balance:s.balance-stake+round.payout,baccarat:{rounds:[round,...s.baccarat.rounds].slice(0,10000)}};
  if(!commit(recordBalance(s,next,'baccarat',round.id),true))return;
  baccaratResult.current=round;setBaccaratPayout(round.payout);setToast('');
 }
 function revealAdded(s:Save,next:Save,game:AddedGame,round:Settlement){
  if(!commit(recordBalance(s,next,game,round.id),true))return false;
  addedResult.current={game,round};setAddedPayout(round.payout);setToast('');return true;
 }
 function gameError(error:unknown){setToast(error instanceof Error?error.message:'Не удалось выполнить ход.');}
 function dealVideoPoker(stake:bigint){
  const s=current.current;if(busy.current||hasActiveHand(s)||s.activeGame!=='videopoker')return;
  if(!isVideoPokerStake(stake)||stake>s.balance){setToast('Выберите положительную целую ставку в пределах баланса.');return;}
  try{const hand=startVideoPoker(stake);if(commit({...s,balance:s.balance-stake,videopoker:{...s.videopoker,hand}},true))sound('chip',s.sound);}catch(error){gameError(error);}
 }
 function drawPoker(held:number[]){
  const s=current.current,h=s.videopoker.hand;if(!h||s.activeGame!=='videopoker')return;
  try{const round=drawVideoPoker(h,held);revealAdded(s,{...s,balance:s.balance+round.payout,videopoker:{hand:null,rounds:[round,...s.videopoker.rounds].slice(0,10000)}},'videopoker',round);}catch(error){gameError(error);}
 }
 function throwDice(stake?:bigint){
  const s=current.current,h=s.dice.hand;if(busy.current||s.activeGame!=='dice'||(!h&&hasActiveHand(s)))return;
  if(!h&&(stake===undefined||!isDiceStake(stake)||stake>s.balance)){setToast('Выберите положительную целую ставку в пределах баланса.');return;}
  try{
   const turn=h?rollDice(h):startDice(stake!),reserved=h?0n:stake!;
   const next:Save={...s,balance:s.balance-reserved+(turn.round?.payout??0n),dice:{hand:turn.hand,rounds:turn.round?[turn.round,...s.dice.rounds].slice(0,10000):s.dice.rounds}};
   if(turn.round)revealAdded(s,next,'dice',turn.round);else if(commit(next,true))sound('spin',s.sound);
  }catch(error){gameError(error);}
 }
 function dealHoldem(buyin:bigint){
  const s=current.current;if(busy.current||hasActiveHand(s)||s.activeGame!=='holdem')return;
  if(buyin<200n||buyin>s.balance){setToast('Бай-ин — целое число от 200 фишек в пределах баланса.');return;}
  try{
   const turn=startHoldem(buyin,s.holdem.rounds.length?(s.holdem.rounds[0].dealer+1)%3:0);
   const next:Save={...s,balance:s.balance-buyin+(turn.round?.payout??0n),holdem:{hand:turn.hand,rounds:turn.round?[turn.round,...s.holdem.rounds].slice(0,10000):s.holdem.rounds}};
   if(turn.round)revealAdded(s,next,'holdem',turn.round);else if(commit(next,true))sound('chip',s.sound);
  }catch(error){gameError(error);}
 }
 function playHoldem(action?:HoldemAction){
  const s=current.current,h=s.holdem.hand;if(busy.current||!h||s.activeGame!=='holdem'||(action?h.actor!==0:h.actor===0))return;
  try{
   const turn=actHoldem(h,action??botAction(h));
   const next:Save={...s,balance:s.balance+(turn.round?.payout??0n),holdem:{hand:turn.hand,rounds:turn.round?[turn.round,...s.holdem.rounds].slice(0,10000):s.holdem.rounds}};
   if(turn.round)revealAdded(s,next,'holdem',turn.round);else if(commit(next,true))sound('chip',s.sound);
  }catch(error){gameError(error);}
 }
 function openWithdrawal(){if(busy.current||blackjackBusy.current||baccaratBusy.current||addedBusy.current||!withdrawalImage)return;auto.cancel();setModal('withdraw');}
 function addBalance(amount:bigint|null){const s=current.current;if(busy.current||blackjackBusy.current||baccaratBusy.current||addedBusy.current)return;if(amount===null||amount<=0n){setToast('Введите положительную целую сумму пополнения.');return;}commit(recordBalance(s,{...s,balance:s.balance+amount},'topup'));setModal(null);setCustom('');setToast(`Баланс пополнен на ${money(amount)} фишек`);}
 function exportSave(){const blob=new Blob([stringifySave(current.current,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`maison-royale-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function importSave(file?:File){if(!file||busy.current||blackjackBusy.current||baccaratBusy.current||addedBusy.current)return;try{if(file.size>10_000_000)throw new Error('Файл слишком большой (максимум 10 МБ).');const s=recover(parseSave(await file.text()));if(busy.current||blackjackBusy.current||baccaratBusy.current||addedBusy.current){setToast('Дождитесь окончания раунда перед импортом.');return;}if(!window.confirm('Заменить текущий баланс, ставки и историю данными из файла?'))return;if(commit(s,true)){auto.restart();setAmountMode('chip');setResult(null);setRotation(0);setBallPocket(0);setToast('Сохранение успешно импортировано.');}}catch(e){setToast(e instanceof Error?e.message:'Не удалось импортировать файл.');}finally{if(input.current)input.current.value='';}}
 const displayedBets=save.pending?.bets??save.bets,stake=total(displayedBets),rounds=save.rounds,net=rounds.reduce((s,r)=>s+r.net,0n);
 const largestWin=rounds.reduce((best,r)=>r.net>best?r.net:best,0n);
 return <div className="app-shell"><header className="header"><a className="brand" href="#" aria-label="Maison Royale"><span className="brand-symbol">♜</span><span>MAISON <b>ROYALE</b><small>PRIVATE CASINO · EST. 1863</small></span></a><div className="header-center"><span className="live-dot"/> ВАШ ЛИЧНЫЙ ИГРОВОЙ ЗАЛ</div><div className="header-right"><button className="icon-button" onClick={()=>commit({...current.current,sound:!current.current.sound})} aria-label={save.sound?'Выключить звук':'Включить звук'} title="Звук">{save.sound?<Volume2 size={18}/>:<VolumeX size={18}/>}</button><div className="balance"><span>ВАШ БАЛАНС</span><strong><Coins size={17}/><span className="balance-amount" title={money(displayedBalance)}>{money(displayedBalance)}</span> <small>фишек</small></strong></div><>{withdrawalImage&&<button className="withdraw-button" aria-label="Вывести фишки" title="Вывести фишки" disabled={spinning||cardAnimating} onClick={openWithdrawal}><ArrowUpRight size={17}/><span>Вывести</span></button>}</><button className="plus-button" aria-label="Пополнить баланс" title="Пополнить баланс" disabled={spinning||cardAnimating} onClick={()=>setModal('balance')}><Plus size={20}/></button></div></header>
 <main><nav className="game-tabs" role="tablist" aria-label="Выбор игры" onKeyDown={e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||spinning||cardAnimating||activeHand)return;
  e.preventDefault();const index=gameTabs.findIndex(g=>g.id===save.activeGame);
  const next=gameTabs[e.key==='Home'?0:e.key==='End'?gameTabs.length-1:(index+(e.key==='ArrowRight'?1:gameTabs.length-1))%gameTabs.length].id;
  chooseGame(next);document.getElementById(`${next}-tab`)?.focus();
 }}>{gameTabs.map(game=><button key={game.id} id={`${game.id}-tab`} role="tab" tabIndex={save.activeGame===game.id?0:-1} aria-selected={save.activeGame===game.id} aria-controls={`${game.id}-panel`} disabled={spinning||cardAnimating||activeHand} onClick={()=>chooseGame(game.id)}><span>{game.icon}</span> {game.label}</button>)}<span className="game-tabs-note">{spinning?'Дождитесь остановки колеса':cardAnimating?'Дождитесь завершения раздачи':activeHand?'Завершите текущий раунд':'Один баланс — шесть игровых столов'}</span></nav><section className="title-row"><div><div className="eyebrow"><span/> КЛАССИКА КАЗИНО</div><h1>{save.activeGame==='videopoker'?<>Видеопокер <em>· Jacks or Better</em></>:save.activeGame==='dice'?<>Кости <em>· Pass Line</em></>:save.activeGame==='holdem'?<>Техасский <em>холдем</em></>:save.activeGame==='baccarat'?<>Баккара <em>· Punto Banco</em></>:save.activeGame==='blackjack'?<>Блэкджек <em>· 21</em></>:<>Американская <em>рулетка</em></>}</h1><p>{save.activeGame==='videopoker'?'Пять карт, один обмен. Решайте, какие карты оставить.':save.activeGame==='dice'?'Первый бросок, точка и удача. Две кости решают исход.':save.activeGame==='holdem'?'Вы и два соперника. Четыре улицы торговли, один банк.':save.activeGame==='baccarat'?'Две руки, одна ставка. Побеждает ближайший к девяти.':save.activeGame==='blackjack'?'Наберите 21 или обыграйте дилера. Каждая карта решает.':'Два зелёных сектора: 0 и 00. Играйте по своим правилам.'}</p></div><button className="text-button rules-button" onClick={()=>setModal('rules')}><CircleHelp size={16}/> Правила игры <ChevronDown size={14}/></button></section>
 <section className="playback-settings" aria-label="Настройки анимации"><label htmlFor="animation-speed">Скорость анимаций <select id="animation-speed" value={save.animationSpeed} disabled={spinning||cardAnimating} onChange={e=>commit({...current.current,animationSpeed:e.target.value as Save['animationSpeed']})}><option value="slow">Спокойная</option><option value="normal">Обычная</option><option value="fast">Быстрая</option></select></label><span>Общая для всех игр · учитываем уменьшение движения в системе</span></section>
 {save.activeGame==='roulette'?<div id="roulette-panel" role="tabpanel" aria-labelledby="roulette-tab"><section className="casino-table"><div className="table-topline"><span><span className="live-dot"/> СТОЛ № 01 <i/> AMERICAN ROULETTE</span><span className="table-limit">СТАВКИ ОТ 1 · ВЫПЛАТА ДО 35:1</span></div><div className="play-layout"><Wheel durationScale={durationScale} soundEnabled={save.sound} pocket={ballPocket} rotation={rotation} spinning={spinning} onComplete={()=>{if(busy.current)finish();}} result={result}/><div className="bet-area"><div className="bet-area-header"><span>{spinning?'СТАВКИ ЗАКРЫТЫ':'ДЕЛАЙТЕ ВАШИ СТАВКИ'}</span><span className="subtle">{spinning?'Колесо вращается…':'Выберите сумму и поле'}</span></div>
 <div className={`auto-spin-bar ${auto.seconds!==null?'counting':''}`}><label className="auto-switch"><input type="checkbox" checked={save.autoSpin} disabled={spinning||cardAnimating} onChange={e=>commit({...current.current,autoSpin:e.target.checked})}/><span className="switch-track"/><span>Автозапуск · 7 сек</span></label><span className="countdown" role="timer" aria-label="До автоматического вращения">{spinning?'Идёт вращение':auto.seconds!==null?<>Старт через <strong>{auto.seconds}</strong> сек</>:save.autoSpin?(save.bets.length?'Отсчёт приостановлен':'Отсчёт после первой ставки'):'Ручной запуск'}</span></div><BettingTable bets={displayedBets} place={place} disabled={spinning||cardAnimating} result={result}/><div className="bet-tools"><button onClick={undo} disabled={spinning||!save.bets.length}><Undo2 size={15}/> Отменить <span className="desktop-only">последнюю ставку</span></button><button onClick={clear} disabled={spinning||!save.bets.length}><Trash2 size={14}/> Очистить <span className="desktop-only">ставки</span></button><button onClick={repeat} disabled={spinning||!save.lastBets.length}><RotateCcw size={14}/> Повторить ставку</button></div><div className="last-results"><span>ПОСЛЕДНИЕ ЧИСЛА</span><div className="results-list">{rounds.length?rounds.slice(0,20).map((r,i)=><span key={r.id} className={`result-number ${color(r.number)} ${i===0?'latest':''}`}>{r.number}</span>):<span className="empty-results">История начнётся с первого вращения</span>}</div></div></div></div>
 <div className="controls-bar"><div className="chip-picker"><span className="control-label">ВЫБЕРИТЕ СУММУ</span><div className="chips">{chips.map((n,i)=><button key={n} disabled={spinning||cardAnimating} className={`chip chip-${i} ${amountMode==='chip'&&chip===BigInt(n)?'selected':''}`} onClick={()=>{setAmountMode('chip');setChip(BigInt(n));sound('chip',save.sound);}} aria-label={`Фишка ${money(n)}`} aria-pressed={amountMode==='chip'&&chip===BigInt(n)}><span>{n>=10000?`${n/1000}к`:money(n)}</span></button>)}</div><div className="amount-controls"><label className={`custom-bet ${amountMode==='custom'?'active':''}`}><span>Своя сумма</span><input aria-label="Своя сумма ставки" inputMode="numeric" type="text" placeholder="Например, 25 000" value={customBet} disabled={spinning||cardAnimating} onFocus={()=>setAmountMode('custom')} onChange={e=>{setAmountMode('custom');setCustomBet(e.target.value);}}/></label><button className={`all-in-button ${amountMode==='allin'?'active':''}`} disabled={spinning||save.balance===0n} aria-pressed={amountMode==='allin'} onClick={()=>{setAmountMode('allin');sound('chip',save.sound);}}>All In <small>Весь баланс</small></button></div><p className="amount-hint">{selectedAmount!==null&&selectedAmount>0n?`На поле: ${readableMoney(selectedAmount)} фишек`:'Введите целую сумму от 1'} · нажмите на нужную ячейку</p></div><div className="round-stake"><span className="control-label">ВАША СТАВКА</span><strong>{readableMoney(stake)} <small>фишек</small></strong></div><motion.button whileTap={{scale:.98}} className="spin-button" disabled={spinning||!save.bets.length} onClick={spin}><RotateCcw size={19} className={spinning?'rotating':''}/>{spinning?'ВРАЩЕНИЕ…':'КРУТИТЬ'}<span>→</span></motion.button></div></section>
 <section className="lower-grid"><div className="session-card"><div className="section-heading"><span><BarChart3 size={17}/> Ваша игровая сессия</span><button onClick={()=>setModal('stats')}>Вся статистика →</button></div><div className="session-stats"><div><span>Всего вращений</span><strong>{rounds.length}</strong></div><div><span>Победных раундов</span><strong>{rounds.filter(r=>r.net>0n).length}</strong></div><div><span>Чистый результат</span><strong className={net>0n?'positive':net<0n?'negative':''}>{net>0n?'+':''}{readableMoney(net)} <small>фишек</small></strong></div></div></div><div className="history-card"><History size={24}/><div><h3>У каждой ставки своя история</h3><p>Все ваши раунды — в одном месте</p></div><button className="icon-button" aria-label="Открыть историю ставок" onClick={()=>setModal('history')}>→</button></div></section>
 </div>:save.activeGame==='blackjack'?<div id="blackjack-panel" role="tabpanel" aria-labelledby="blackjack-tab"><BlackjackTable durationScale={durationScale} onPresentationChange={onBlackjackPresentation} onRoundRevealed={onBlackjackRevealed} balance={displayedBalance} hand={save.blackjack.hand} rounds={save.blackjack.rounds} disabled={spinning||cardAnimating} onDeal={dealBlackjack} onHit={()=>actBlackjack('hit')} onStand={()=>actBlackjack('stand')} onDouble={()=>actBlackjack('double')}/></div>:save.activeGame==='baccarat'?<div id="baccarat-panel" role="tabpanel" aria-labelledby="baccarat-tab"><BaccaratTable durationScale={durationScale} balance={displayedBalance} rounds={save.baccarat.rounds} disabled={spinning||cardAnimating} onDeal={dealBaccarat} onPresentationChange={onBaccaratPresentation} onRoundRevealed={onBaccaratRevealed}/></div>:save.activeGame==='videopoker'?<div id="videopoker-panel" role="tabpanel" aria-labelledby="videopoker-tab"><VideoPokerTable balance={displayedBalance} hand={save.videopoker.hand} rounds={save.videopoker.rounds} disabled={spinning||cardAnimating} durationScale={durationScale} onDeal={dealVideoPoker} onDraw={drawPoker} onPresentationChange={onAddedPresentation} onRoundRevealed={onAddedRevealed}/></div>:save.activeGame==='dice'?<div id="dice-panel" role="tabpanel" aria-labelledby="dice-tab"><DiceTable balance={displayedBalance} hand={save.dice.hand} rounds={save.dice.rounds} disabled={spinning||cardAnimating} durationScale={durationScale} onStart={throwDice} onRoll={()=>throwDice()} onPresentationChange={onAddedPresentation} onRoundRevealed={onAddedRevealed}/></div>:<div id="holdem-panel" role="tabpanel" aria-labelledby="holdem-tab"><HoldemTable balance={displayedBalance} hand={save.holdem.hand} rounds={save.holdem.rounds} disabled={spinning||cardAnimating} durationScale={durationScale} onStart={dealHoldem} onAction={playHoldem} onBot={()=>playHoldem()} onPresentationChange={onAddedPresentation} onRoundRevealed={onAddedRevealed}/></div>}
 <BalanceChart points={save.balanceHistory.filter(point=>point.id!==blackjackResult.current?.id&&point.id!==baccaratResult.current?.id&&point.id!==addedResult.current?.round.id)}/>
 <div className="bottom-tools"><span><ShieldCheck size={15}/> Только виртуальные фишки. Настоящее удовольствие от игры.</span><div><button disabled={spinning||cardAnimating} onClick={exportSave}><ArrowDownToLine size={14}/> Экспорт</button><button disabled={spinning||cardAnimating} onClick={()=>input.current?.click()}><ArrowUpFromLine size={14}/> Импорт</button></div></div>{storageError&&<p className="storage-warning" role="alert">Сохранение недоступно. Не закрывайте вкладку; экспортируйте данные в JSON.</p>}
 </main><footer><span className="footer-brand">MAISON ROYALE</span><span>Шесть игр · Виртуальные фишки · 100% локально</span><span>Играйте ради удовольствия <span className="age">18+</span></span></footer>
 <input ref={input} type="file" accept=".json,application/json" hidden onChange={e=>void importSave(e.target.files?.[0])}/>
 <AnimatePresence>{toast&&<motion.div role="status" className="toast" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}}><Sparkles size={18}/><span>{toast}</span><button aria-label="Закрыть уведомление" onClick={()=>setToast('')}><X size={16}/></button></motion.div>}</AnimatePresence>
 <AnimatePresence>{modal&&<motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>{setModal(null);setReset(false);}}><motion.section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal ${modal==='history'?'wide':''}`} initial={{scale:.96,y:15}} animate={{scale:1,y:0}} onClick={e=>e.stopPropagation()}><button autoFocus className="modal-close icon-button" onClick={()=>{setModal(null);setReset(false);}} aria-label="Закрыть"><X size={20}/></button><div className="eyebrow">MAISON ROYALE</div><h2 id="modal-title">{modal==='balance'?'Ваши фишки':modal==='history'?'История ставок':modal==='stats'?'Статистика игры':modal==='withdraw'?'Вывод фишек':save.activeGame==='videopoker'?'Правила видеопокера':save.activeGame==='dice'?'Правила игры в кости':save.activeGame==='holdem'?'Правила холдема':save.activeGame==='baccarat'?'Правила баккары':save.activeGame==='blackjack'?'Правила блэкджека':'Правила рулетки'}</h2>
 {modal==='withdraw'&&withdrawalImage&&<Withdrawal balance={save.balance} imageSrc={withdrawalImage} onClose={()=>setModal(null)}/>}
 {modal==='balance'&&<><p>Виртуальная валюта для вашей игры. Без платежей и реальных денег.</p><div className="modal-balance">{readableMoney(displayedBalance)} <small>фишек</small></div><div className="topup-options">{[1000,5000,10000,50000].map(n=><button disabled={spinning||cardAnimating} key={n} onClick={()=>addBalance(BigInt(n))}>+ {money(n)}</button>)}</div><form className="custom-topup" onSubmit={e=>{e.preventDefault();addBalance(parseMoneyInput(custom));}}><input aria-label="Своя сумма пополнения" type="text" inputMode="numeric" placeholder="Своя сумма" value={custom} onChange={e=>setCustom(e.target.value)}/><button className="gold-button" disabled={spinning||cardAnimating||!custom}>Пополнить баланс</button></form>{withdrawalImage&&<button className="balance-withdraw-button" disabled={spinning||cardAnimating} onClick={openWithdrawal}><ArrowUpRight size={16}/> Вывести фишки</button>}<div className="reset-area">{reset?<><p>Вернуть баланс к 10 000? Текущие ставки будут сняты. История сохранится.</p><button className="danger-button" disabled={spinning||cardAnimating||activeHand} onClick={()=>{const s=current.current;if(hasActiveHand(s))return;commit(recordBalance(s,{...s,balance:initial().balance,bets:[]},'reset'));setReset(false);setModal(null);setToast('Баланс сброшен до 10 000 фишек.');}}>Да, сбросить баланс</button><button className="text-button" onClick={()=>setReset(false)}>Отмена</button></>:<button className="text-button" disabled={spinning||cardAnimating||activeHand} onClick={()=>setReset(true)}>Сбросить баланс</button>}</div></>}
 {modal==='history'&&<>{!rounds.length?<div className="empty-state"><History size={32}/><h3>Ваш первый раунд впереди</h3><p>Поставьте фишки на поле и запустите колесо.</p></div>:<><div className="history-strip">{rounds.slice(0,20).map(r=><span key={r.id} className={`result-number ${color(r.number)}`}>{r.number}</span>)}</div><div className="history-table-scroll"><table><thead><tr><th>Дата и время</th><th>Ставка</th><th>Число / цвет</th><th>Возврат</th><th>Итог</th></tr></thead><tbody>{rounds.map(r=><tr key={r.id}><td>{new Date(r.date).toLocaleString('ru-RU')}</td><td title={r.bets.map(b=>`${betName(b.id)}: ${b.amount}`).join(', ')}>{money(r.stake)}</td><td><span className={`number-dot ${color(r.number)}`}>{r.number}</span> {colorName(r.number)}</td><td>{money(r.payout)}</td><td className={r.net>0n?'positive':r.net<0n?'negative':''}>{r.net>0n?'+':''}{money(r.net)}<small className="outcome">{r.net>0n?'Выигрыш':r.net<0n?'Проигрыш':'Возврат ставки'}</small></td></tr>)}</tbody></table></div><p className="small-muted">Возврат включает выигрыш и номинал сыгравших ставок. Итог = возврат − все ставки раунда.</p></>}</>}
 {modal==='stats'&&<><div className="full-stats">{[['Всего спинов',rounds.length],['Количество ставок',rounds.reduce((s,r)=>s+r.bets.length,0)],['Победных раундов',rounds.filter(r=>r.net>0n).length],['Проигрышных раундов',rounds.filter(r=>r.net<0n).length],['Раундов без изменения',rounds.filter(r=>r.net===0n).length],['Сумма всех ставок',rounds.reduce((s,r)=>s+r.stake,0n)],['Сумма всех возвратов',rounds.reduce((s,r)=>s+r.payout,0n)],['Чистый итог',net],['Самый крупный выигрыш (чистый)',largestWin]].map(([label,value])=><div key={label}><span>{label}</span><strong>{typeof value==='string'?value:readableMoney(value)}</strong></div>)}</div><p className="small-muted">Одна ставка — одна установленная фишка. Статистика рассчитывается по сохранённой истории (до 10 000 раундов). Сумма возвратов включает номинал выигравших ставок.</p></>}
 {modal==='rules'&&(save.activeGame==='videopoker'||save.activeGame==='dice'||save.activeGame==='holdem')&&<AddedGameRules game={save.activeGame}/>}
 {modal==='rules'&&save.activeGame==='baccarat'&&<div className="rules-content"><p>Выберите, кто окажется ближе к 9: Игрок, Банкир или Ничья. Вы только делаете ставку: карты добираются автоматически по правилам Punto Banco.</p><p>Туз — 1 очко, карты от 2 до 9 — по номиналу, десятки и картинки — 0. Учитывается последняя цифра суммы: 17 даёт 7. При начальных 8 или 9 обе руки останавливаются.</p><div className="full-stats"><div><span>Победа Игрока</span><strong>1:1</strong></div><div><span>Победа Банкира</span><strong>0,95:1</strong></div><div><span>Ничья</span><strong>8:1</strong></div></div><p>Выигравшая ставка тоже возвращается. С победы Банкира удерживается комиссия 5% от выигрыша: ставка 100 вернёт 195. При ничьей ставки на Игрока и Банкира возвращаются. Ставки от 20 и кратны 20 — все расчёты точные, без округления.</p><p>Игрок добирает при 0–5, стоит на 6–7. Если Игрок стоит, Банкир добирает при 0–5. Иначе Банкир добирает при 0–2 всегда; при 3 — кроме третьей карты Игрока 8; при 4 — на 2–7; при 5 — на 4–7; при 6 — на 6–7; на 7 стоит.</p><p>Каждый раунд использует заново перемешанные шесть колод. Результат сохраняется до анимации и не зависит от её скорости. При перезагрузке принятый раунд будет показан сразу, повторной выплаты не будет.</p></div>}
 {modal==='rules'&&save.activeGame==='blackjack'&&<div className="rules-content"><p>Цель — набрать больше очков, чем дилер, не превысив 21. Карты от 2 до 10 стоят свой номинал, валет, дама и король — 10. Туз считается за 1 или 11, выбирается лучший допустимый итог.</p><p>«Ещё» добавляет карту. «Хватит» завершает ход. «Удвоить» добавляет ещё одну такую же ставку, даёт одну карту и передаёт ход дилеру; доступно только на первых двух картах при достаточном балансе.</p><div className="full-stats"><div><span>Блэкджек: туз и карта на 10</span><strong>3:2</strong></div><div><span>Обычная победа</span><strong>1:1</strong></div><div><span>Ничья</span><strong>Возврат ставки</strong></div></div><p>Ставки от 2 фишек и кратны 2, чтобы выплата 3:2 всегда была целой. Дилер добирает до 17 и останавливается на любых 17, в том числе с тузом. При переборе игрок проигрывает сразу.</p><p>Каждая раздача начинается с новой перемешанной колоды из 52 карт. Сплит и страховка не предусмотрены. Незавершённая раздача сохраняется и продолжается после перезагрузки; сменить игру можно после её завершения.</p></div>}
 {modal==='rules'&&save.activeGame==='roulette'&&<div className="rules-content"><p>Выберите номинал фишки и нажмите на число или зону. Можно сделать несколько ставок. Сумма сразу резервируется из баланса. При включённом автозапуске колесо начнёт вращение через 7 секунд после первой ставки. Дополнительные ставки не продлевают отсчёт. Можно запустить его раньше кнопкой «Крутить». Очистка ставок отменяет таймер. После раунда ставки автоматически не повторяются.</p><div className="full-stats">{[['Одно число','35:1'],['Красное / чёрное','1:1'],['Чёт / нечёт','1:1'],['1–18 / 19–36','1:1'],['12 чисел / колонка','2:1']].map(([a,b])=><div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div><p>При выигрыше возвращается и сама ставка: например, 100 на число дают 3 600 фишек возврата. Ставки на 0 и 00 независимы: каждый зелёный сектор выигрывает только при ставке на него. На обоих зеро проигрывают все внешние ставки.</p><p>Результат выбирается через криптографический генератор браузера. У каждого числа вероятность 1/38; преимущество казино — 5,26%. Ставки на соседние числа (сплиты, улицы и каре) не предусмотрены этим полем.</p><p>Своя сумма — любое положительное целое число в пределах доступного баланса. All In выбирает весь свободный баланс для следующего нажатия на поле; уже сделанные ставки остаются.</p><p>Фиксированного потолка баланса нет. Любая ставка и выигрыш рассчитываются целыми фишками без округления. Данные хранятся в этом браузере; экспортируйте JSON для резервной копии. При закрытии вкладки во время вращения принятый раунд будет рассчитан при следующем открытии.</p></div>}
 </motion.section></motion.div>}</AnimatePresence></div>;
}
