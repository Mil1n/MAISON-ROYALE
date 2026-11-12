import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cardLabel, cardRank, cardSuit, type Card } from '../blackjack';
import { evaluateHoldem, getLegalActions, type HoldemAction, type HoldemHand, type HoldemRound, type HoldemSeat } from '../holdem';
import { money, parseMoneyInput } from '../game';
import '../holdem.css';

export type HoldemTableProps = {
  balance: bigint;
  hand: HoldemHand | null;
  rounds: HoldemRound[];
  disabled: boolean;
  durationScale?: number;
  onStart: (buyin: bigint) => void;
  onAction: (action: HoldemAction) => void;
  onBot: () => void;
  onPresentationChange?: (busy: boolean) => void;
  onRoundRevealed?: (round: HoldemRound) => void;
};

const streets: Record<string, string> = { preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер', showdown: 'Вскрытие', fold: 'Все соперники сбросили' };
const actionNames: Record<string, string> = { fold: 'пас', check: 'чек', call: 'колл', raise: 'рейз до' };

/** Hidden opponents have no card value in text, attributes, or the accessible tree. */
function PokerCard({ card, scale, reduced }: { card: Card | null; scale: number; reduced: boolean }) {
  const suit = card === null ? '' : cardSuit(card);
  const rank = card === null ? '' : cardRank(card);
  return <motion.div className={`holdem-card ${card === null ? 'holdem-card--back' : suit === '♥' || suit === '♦' ? 'holdem-card--red' : ''}`}
    role="img" aria-label={card === null ? 'Закрытая карта соперника' : `Карта ${cardLabel(card)}`}
    initial={reduced ? false : { opacity: 0, y: -12, rotateY: card === null ? 0 : 75 }}
    animate={{ opacity: 1, y: 0, rotateY: 0 }} transition={{ duration: reduced ? 0 : .32 * scale }} key={card === null ? 'back' : 'face'}>
    {card === null ? <span className="holdem-card-back" aria-hidden="true">♜<small>MR</small></span> : <>
      <span className="holdem-card-corner" aria-hidden="true"><b>{rank}</b><i>{suit}</i></span>
      <span className="holdem-card-suit" aria-hidden="true">{suit}</span>
      <span className="holdem-card-corner holdem-card-corner--bottom" aria-hidden="true"><b>{rank}</b><i>{suit}</i></span>
    </>}
  </motion.div>;
}

export function HoldemTable({ balance, hand, rounds, disabled, durationScale = 1, onStart, onAction, onBot, onPresentationChange, onRoundRevealed }: HoldemTableProps) {
  const reduced = Boolean(useReducedMotion());
  const scale = Number.isFinite(durationScale) ? Math.max(.25, Math.min(3, durationScale)) : 1;
  const last = rounds[0] ?? null;
  const source = hand ?? last;
  const sourceKey = hand ? `${hand.id}:${hand.actions.length}:${hand.board.length}:${hand.actor}` : last ? `${last.id}:settled` : 'empty';
  const [model, setModel] = useState<HoldemHand | HoldemRound | null>(source);
  const [boardCount, setBoardCount] = useState(source?.board.length ?? 0);
  const [holeCount, setHoleCount] = useState(source ? 2 : 0);
  const [showdown, setShowdown] = useState(!hand && last?.street === 'showdown');
  const [settledId, setSettledId] = useState(!hand ? last?.id : undefined);
  const [animating, setAnimating] = useState(false);
  const [botWaiting, setBotWaiting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [buyin, setBuyin] = useState('1000');
  const [raiseTo, setRaiseTo] = useState(() => hand ? getLegalActions(hand).minRaiseTo.toString() : '');
  const [error, setError] = useState('');
  const id = useId();
  const currentView = useRef<{ id: string | undefined; board: number; hole: number }>({ id: source?.id, board: source?.board.length ?? 0, hole: source ? 2 : 0 });
  const previousSource = useRef(sourceKey);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const botTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const botAttempt = useRef('');
  const callbacks = useRef({ onPresentationChange, onRoundRevealed, onBot });
  callbacks.current = { onPresentationChange, onRoundRevealed, onBot };
  const setBusy = (value: boolean) => {
    if (busy.current === value) return;
    busy.current = value;
    setAnimating(value);
    callbacks.current.onPresentationChange?.(value);
  };

  useLayoutEffect(() => {
    if (previousSource.current === sourceKey) return;
    previousSource.current = sourceKey;
    clearTimeout(fallback.current);
    clearTimeout(botTimer.current);
    timers.current.forEach(clearTimeout); timers.current = [];
    setBotWaiting(false);
    setModel(source);
    setError('');
    if (!source) {
      setBoardCount(0); setHoleCount(0); setShowdown(false); setSettledId(undefined);
      currentView.current = { id: undefined, board: 0, hole: 0 }; setBusy(false); return;
    }
    const fresh = currentView.current.id !== source.id;
    const startBoard = fresh ? 0 : Math.min(currentView.current.board, source.board.length);
    setBoardCount(startBoard);
    setShowdown(false);
    setSettledId(undefined);
    setHoleCount(fresh ? 0 : 2);
    currentView.current = { id: source.id, board: startBoard, hole: fresh ? 0 : 2 };
    if (hand) setRaiseTo(getLegalActions(hand).minRaiseTo.toString());
    setBusy(true);
    const queue = (at: number, task: () => void) => {
      if (reduced || at === 0) task();
      else timers.current.push(setTimeout(task, at * scale));
    };
    let at = 0;
    if (fresh) {
      at = 100;
      queue(at, () => { setHoleCount(1); currentView.current.hole = 1; });
      at += 300;
      queue(at, () => { setHoleCount(2); currentView.current.hole = 2; });
      at += 380;
    }
    for (let count = startBoard + 1; count <= source.board.length; count++) {
      at += 260;
      queue(at, () => { setBoardCount(count); currentView.current.board = count; });
    }
    if (!hand && last?.street === 'showdown') {
      at += 400;
      queue(at, () => setShowdown(true));
      at += 420;
    } else at += 360;
    queue(at, () => {
      if (!hand && last) { setSettledId(last.id); callbacks.current.onRoundRevealed?.(last); }
      setBusy(false);
    });
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    // Identity of a persisted action owns its timeline; changing parent callbacks must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // Bots act once per saved state. A failed save releases the UI and offers a retry.
  useEffect(() => {
    if (!hand || hand.actor === 0 || animating || currentView.current.board < hand.board.length) return;
    const attemptKey = `${sourceKey}:${retry}`;
    if (botAttempt.current === attemptKey) return;
    botAttempt.current = attemptKey;
    setBotWaiting(true); setBusy(true);
    botTimer.current = setTimeout(() => {
      fallback.current = setTimeout(() => { setBotWaiting(false); setBusy(false); }, 500);
      try { callbacks.current.onBot(); }
      catch (cause) {
        clearTimeout(fallback.current); setBotWaiting(false); setBusy(false);
        setError(cause instanceof Error ? cause.message : 'Соперник не смог сделать ход. Попробуйте ещё раз.');
      }
    }, reduced ? 40 : 650 * scale);
    // The source timeline and unmount cleanup own this timer. Clearing it on
    // animating=true would cancel the bot immediately after taking the lock.
    // Parent disabled includes our own presentation lock and cannot gate the bot scheduler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, animating, retry, reduced, scale]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout); clearTimeout(fallback.current); clearTimeout(botTimer.current);
    // StrictMode replays mount effects. A canceled first bot attempt must be
    // eligible to schedule again when that mount is replayed or restored.
    botAttempt.current = '';
    if (busy.current) setBusy(false);
  }, []);

  const execute = (action: () => void) => {
    if (busy.current) return;
    setBusy(true); setError('');
    fallback.current = setTimeout(() => setBusy(false), 500);
    try { action(); } catch (cause) {
      clearTimeout(fallback.current); setBusy(false);
      setError(cause instanceof Error ? cause.message : 'Действие не удалось. Попробуйте ещё раз.');
    }
  };
  const legal = hand ? getLegalActions(hand) : null;
  const complete = Boolean(!hand && last && settledId === last.id);
  const shownRounds = !hand && last && !complete ? rounds.filter(round => round.id !== last.id) : rounds;
  const modelRound = model && 'awards' in model ? model : null;
  const heroTurn = Boolean(hand && hand.actor === 0 && !animating && !disabled);
  const liveBoard = model?.board.slice(0, boardCount) ?? [];
  const pot = model ? modelRound ? modelRound.pot : model.seats.reduce((sum, seat) => sum + seat.contribution, 0n) : 0n;
  const currentStreet = !hand && !complete ? boardCount < 3 ? 'preflop' : boardCount === 3 ? 'flop' : boardCount === 4 ? 'turn' : 'river' : model?.street ?? 'preflop';
  const selectedBuyin = parseMoneyInput(buyin);
  const selectedRaise = parseMoneyInput(raiseTo);
  const validRaise = Boolean(legal?.canRaise && selectedRaise !== null && (selectedRaise >= legal.minRaiseTo || selectedRaise === legal.maxRaiseTo) && selectedRaise <= legal.maxRaiseTo);
  function start(event: FormEvent) {
    event.preventDefault();
    if (disabled || busy.current || hand) return;
    if (selectedBuyin === null || selectedBuyin < 200n) { setError('Для стола нужен бай-ин от 200 целых фишек.'); return; }
    if (selectedBuyin > balance) { setError('Недостаточно фишек для бай-ина.'); return; }
    execute(() => onStart(selectedBuyin));
  }
  function renderSeat(seat: HoldemSeat) {
    const showFaces = seat.id === 0 || showdown && modelRound?.street === 'showdown' && !seat.folded;
    const active = Boolean(hand && hand.actor === seat.id);
    const safeStack = modelRound && !complete ? seat.stack - (modelRound.awards[seat.id] ?? 0n) : seat.stack;
    return <section key={seat.id} className={`holdem-seat ${seat.id === 0 ? 'holdem-seat--hero' : ''} ${active ? 'is-active' : ''} ${seat.folded ? 'is-folded' : ''}`} aria-label={`${seat.name}${active ? ', сейчас ходит' : ''}`}>
      <div className="holdem-seat-heading"><h3>{seat.name}</h3><div>{model?.dealer === seat.id && <span className="holdem-dealer" title="Дилер" aria-label="Дилер">D</span>}{model && (model.dealer + 1) % 3 === seat.id && <small>SB</small>}{model && (model.dealer + 2) % 3 === seat.id && <small>BB</small>}</div></div>
      <div className="holdem-hole">{Array.from({ length: seat.id === 0 ? holeCount : 2 }, (_, index) => <PokerCard key={`${model?.id}-${index}`} card={showFaces ? seat.hole[index] : null} scale={scale} reduced={reduced} />)}</div>
      <div className="holdem-seat-stack"><span>Стек</span><strong title={money(safeStack)}>{money(safeStack)}</strong></div>
      <p>{seat.folded ? 'Пас' : complete && showdown ? evaluateHoldem([...seat.hole, ...liveBoard]).label : seat.allIn ? 'Олл-ин' : active ? seat.id === 0 ? 'Ваш ход' : 'Обдумывает ход…' : seat.streetBet > 0n && hand ? `На улице: ${money(seat.streetBet)}` : 'За столом'}</p>
    </section>;
  }

  return <div className="holdem" aria-busy={animating} data-presentation={animating ? 'dealing' : complete ? 'complete' : hand ? 'playing' : 'empty'}>
    <section className="holdem-table" aria-label="Стол техасского холдема">
      <div className="holdem-topline"><span>СТОЛ № 06 · TEXAS HOLD’EM</span><span>NO LIMIT · БЛАЙНДЫ 10 / 20</span></div>
      <div className="holdem-felt">
        <div className="holdem-opponents">{model ? model.seats.filter(seat => seat.id !== 0).map(renderSeat) : ['Анна', 'Марк'].map(name => <div className="holdem-seat holdem-seat--empty" key={name}><h3>{name}</h3><div className="holdem-hole"><PokerCard card={null} scale={scale} reduced={reduced} /><PokerCard card={null} scale={scale} reduced={reduced} /></div><p>Готовы к раздаче</p></div>)}</div>
        <div className="holdem-center"><div className="holdem-inscription" aria-hidden="true">MAISON ROYALE <b>HOLD’EM</b></div><div className="holdem-pot"><span>{streets[currentStreet]} · БАНК</span><strong>{money(pot)} <small>фишек</small></strong></div>
          <div className="holdem-board" aria-label="Общие карты">{Array.from({ length: 5 }, (_, index) => liveBoard[index] === undefined ? <div className="holdem-card-slot" key={index} aria-hidden="true">{index < 3 ? 'F' : index === 3 ? 'T' : 'R'}</div> : <PokerCard key={`${model?.id}-${index}`} card={liveBoard[index]} scale={scale} reduced={reduced} />)}</div>
        </div>
        <div className="holdem-player">{model ? renderSeat(model.seats[0]) : <p>Две ваши карты. Пять общих. Лучшая комбинация из пяти.</p>}</div>
        <div className="holdem-settlement" aria-live="polite">{complete && last ? <motion.div className="holdem-result" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><span>{last.street === 'fold' ? `${last.seats[last.winners[0]].name}: победа без вскрытия` : `Победитель${last.winners.length > 1 ? 'и' : ''}: ${last.winners.map(winner => last.seats[winner].name).join(', ')}`}</span><strong className={last.net > 0n ? 'positive' : last.net < 0n ? 'negative' : ''}>{last.net > 0n ? '+' : ''}{money(last.net)} <small>фишек</small></strong><small>В кошелёк: {money(last.payout)} · Бай-ин: {money(last.stake)}</small></motion.div> : <p>{animating ? botWaiting ? 'Соперник выбирает действие…' : 'Карты ложатся на стол…' : hand ? hand.actor === 0 ? 'Ваш ход: чек, колл, рейз или пас' : 'Очередь соперника' : 'Садитесь за стол с двумя соперниками'}</p>}</div>
      </div>

      <div className="holdem-controls">{hand && legal ? <>
        <div className="holdem-action-heading"><span>{heroTurn ? 'ВАШ ХОД' : 'РАЗДАЧА ПРОДОЛЖАЕТСЯ'}</span><span>Текущая ставка: <b>{money(hand.bet)}</b> · Для колла: <b>{money(legal.callAmount)}</b></span></div>
        <div className="holdem-actions"><button type="button" disabled={!heroTurn || !legal.canFold} onClick={() => execute(() => onAction({ type: 'fold' }))}>Пас</button>{legal.canCheck ? <button className="holdem-action-gold" type="button" disabled={!heroTurn} onClick={() => execute(() => onAction({ type: 'check' }))}>Чек</button> : <button className="holdem-action-gold" type="button" disabled={!heroTurn || !legal.canCall} onClick={() => execute(() => onAction({ type: 'call' }))}>Колл {money(legal.callAmount)}{legal.callAmount === hand.seats[0].stack ? ' · олл-ин' : ''}</button>}<button type="button" disabled={!heroTurn || !legal.canRaise} onClick={() => execute(() => onAction({ type: 'raise', amount: legal.maxRaiseTo }))}>Олл-ин {money(legal.maxRaiseTo)}</button></div>
        <form className="holdem-raise" onSubmit={event => { event.preventDefault(); if (heroTurn && validRaise && selectedRaise !== null) execute(() => onAction({ type: 'raise', amount: selectedRaise })); }}><label htmlFor={`${id}-raise`}>Рейз до <input id={`${id}-raise`} type="text" inputMode="numeric" autoComplete="off" disabled={!heroTurn || !legal.canRaise} value={raiseTo} onChange={event => setRaiseTo(event.target.value)} aria-describedby={`${id}-raise-hint`} /></label><button type="submit" disabled={!heroTurn || !validRaise}>Повысить</button><p id={`${id}-raise-hint`}>{legal.canRaise ? <>Минимум до {money(legal.minRaiseTo)} · максимум до {money(legal.maxRaiseTo)}. Сумма включает уже поставленные фишки на этой улице.</> : 'Повышение недоступно. Дождитесь своего хода или выберите чек, колл либо пас.'}</p></form>
        {!animating && hand.actor !== 0 && <button className="holdem-retry" type="button" onClick={() => { botAttempt.current = ''; setRetry(value => value + 1); }}>Продолжить ход соперника</button>}
      </> : <form className="holdem-start" onSubmit={start}><div><label htmlFor={`${id}-buyin`}>БАЙ-ИН В РАЗДАЧУ</label><div className="holdem-presets">{[200n, 500n, 1000n, 5000n].map(value => <button key={value.toString()} type="button" disabled={disabled || animating} aria-pressed={selectedBuyin === value} onClick={() => setBuyin(value.toString())}>{money(value)}</button>)}</div><div className="holdem-buyin-input"><input id={`${id}-buyin`} type="text" inputMode="numeric" autoComplete="off" disabled={disabled || animating} value={buyin} onChange={event => { setBuyin(event.target.value); setError(''); }} /><span>фишек</span><button type="button" disabled={disabled || animating || balance < 200n} onClick={() => setBuyin(balance.toString())}>Максимум</button></div><p>От 200 фишек · блайнды 10 / 20 · соперники получают такой же стек</p></div><button className="holdem-start-button" type="submit" disabled={disabled || animating || selectedBuyin === null || selectedBuyin < 200n || selectedBuyin > balance}>{animating ? 'Раздача продолжается…' : 'Сесть за стол'} <span>→</span></button></form>}
      {error && <p className="holdem-error" role="alert">{error}</p>}</div>
    </section>
    {model && model.actions.length > 0 && <details className="holdem-log"><summary>Ходы в этой раздаче <span>{model.actions.length}</span></summary><ol>{model.actions.slice(-15).map((action, index) => <li key={`${model.id}-${model.actions.length - 15 + index}`}><span>{streets[action.street]} · {model.seats[action.seat].name}</span><b>{actionNames[action.type]}{action.amount > 0n ? ` ${money(action.amount)}` : ''}</b></li>)}</ol></details>}
    <section className="holdem-session" aria-label="Статистика холдема"><h3>Ваша сессия в холдеме</h3><div><p><span>Раздач</span><strong>{shownRounds.length}</strong></p><p><span>В плюсе</span><strong>{shownRounds.filter(round => round.net > 0n).length}</strong></p><p><span>Чистый итог</span><strong>{money(shownRounds.reduce((sum, round) => sum + round.net, 0n))}</strong></p></div></section>
    <details className="holdem-history"><summary>История холдема <span>{shownRounds.length ? `${shownRounds.length} раздач` : 'Пока нет раздач'}</span></summary>{shownRounds.length ? <div className="holdem-history-scroll"><table><thead><tr><th>Время</th><th>Бай-ин</th><th>Возврат</th><th>Итог</th></tr></thead><tbody>{shownRounds.slice(0, 50).map(round => <tr key={round.id}><td>{new Date(round.date).toLocaleString('ru-RU')}</td><td>{money(round.stake)}</td><td>{money(round.payout)}</td><td className={round.net > 0n ? 'positive' : round.net < 0n ? 'negative' : ''}>{round.net > 0n ? '+' : ''}{money(round.net)}</td></tr>)}</tbody></table></div> : <p>Завершите первую раздачу — здесь появится её итог.</p>}</details>
    <details className="holdem-rules"><summary>Как играть в техасский холдем</summary><p>Вы играете против Анны и Марка. У каждого две закрытые карты, на столе до пяти общих. Побеждает лучшая комбинация из пяти любых доступных карт. Сила комбинаций: старшая карта, пара, две пары, тройка, стрит, флеш, фулл-хаус, каре, стрит-флеш.</p><p>Перед раздачей малый и большой блайнды ставят 10 и 20. Торговля проходит на префлопе, флопе (три общие карты), тёрне и ривере. «Чек» — без ставки, «Колл» — уравнять, «Рейз до» — повысить ставку на улице до указанной суммы, «Пас» — сбросить карты. «Олл-ин» ставит весь оставшийся стек.</p><p>При олл-ине доступны побочные банки; каждый игрок может выиграть только ту часть банка, которую покрыл. Равные комбинации делят банк, лишняя целая фишка идёт первому победителю слева от дилера. Если все соперники сбросили карты, вскрытия нет.</p><p>Бай-ин резервируется из общего кошелька; по окончании в него возвращаются ваш оставшийся стек и выигрыш. Соперники начинают каждую раздачу с таким же бай-ином. Их решения используют только собственные карты и открытый стол. Незавершённая раздача сохраняется и продолжается после перезагрузки.</p></details>
  </div>;
}
