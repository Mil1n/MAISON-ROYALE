import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { ArrowDownToLine, BarChart3, ChevronDown, Coins, Crown, History, Layers3, Play, Plus, ShieldCheck } from 'lucide-react';
import { cardLabel, cardRank, cardSuit, handValue, isBlackjackStake, type BJHand, type BJRound, type Card } from '../blackjack';
import { money, parseMoneyInput } from '../game';
import { blackjackView, planBlackjackPresentation } from '../blackjackPresentation';
import '../blackjack.css';

export type BlackjackTableProps = {
  balance: bigint;
  hand: BJHand | null;
  rounds: BJRound[];
  disabled: boolean;
  onDeal: (stake: bigint) => void;
  onHit: () => void;
  onStand: () => void;
  onDouble: () => void;
  onPresentationChange?: (busy: boolean) => void;
  onRoundRevealed?: (round: BJRound) => void;
};

const presets = [100n, 500n, 1000n, 5000n, 10000n];
const outcomeLabel: Record<BJRound['outcome'], string> = {
  blackjack: 'Блэкджек!',
  win: 'Победа',
  loss: 'Проигрыш',
  push: 'Ничья',
};
const pipPositions: Record<number, [number, number][]> = {
  2: [[1, 2], [5, 2]],
  3: [[1, 2], [3, 2], [5, 2]],
  4: [[1, 1], [1, 3], [5, 1], [5, 3]],
  5: [[1, 1], [1, 3], [3, 2], [5, 1], [5, 3]],
  6: [[1, 1], [1, 3], [3, 1], [3, 3], [5, 1], [5, 3]],
  7: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3], [5, 1], [5, 3]],
  8: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3], [4, 2], [5, 1], [5, 3]],
  9: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 2], [4, 1], [4, 3], [5, 1], [5, 3]],
  10: [[1, 1], [1, 3], [2, 1], [2, 3], [2, 2], [4, 1], [4, 3], [4, 2], [5, 1], [5, 3]],
};

/** A hidden card has no face value in its DOM, even during the first half of a flip. */
function PlayingCard({ card }: { card: Card | null }) {
  const reducedMotion = useReducedMotion();
  const [face, setFace] = useState(card);
  const flip = useMotionValue(0);
  useEffect(() => {
    if (face === card) return;
    if (reducedMotion || card === null) { setFace(card); flip.set(0); return; }
    let stopped = false;
    let opening: ReturnType<typeof animate> | undefined;
    const closing = animate(flip, 90, { duration: .24, ease: 'easeIn' });
    closing.then(() => {
      if (stopped) return;
      setFace(card);
      flip.set(-90);
      opening = animate(flip, 0, { duration: .28, ease: 'easeOut' });
    });
    return () => { stopped = true; closing.stop(); opening?.stop(); };
  // The face update at the midpoint must not cancel the second half of the flip.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, reducedMotion, flip]);
  const rank = face === null ? '' : cardRank(face);
  const suit = face === null ? '' : cardSuit(face);
  const red = suit === '♥' || suit === '♦';
  const pips = pipPositions[Number(rank)];
  return <motion.div className="bj-card-shell" layout="position"
    initial={reducedMotion ? false : { opacity: 0, x: 56, y: -34, rotate: -9, scale: .94 }}
    animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
    transition={{ duration: reducedMotion ? 0 : .44, ease: [.2, .75, .25, 1], layout: { duration: reducedMotion ? 0 : .35 } }}>
    <motion.div className={`bj-card ${face === null ? 'bj-card--back' : red ? 'bj-card--red' : 'bj-card--black'}`}
      style={{ rotateY: flip }} role="img" aria-label={face === null ? 'Закрытая карта дилера' : `Карта ${cardLabel(face)}`}>
      {face === null ? <div className="bj-card__back-frame" aria-hidden="true"><Crown /><span>MR</span><i>MAISON ROYALE</i></div> : <>
        <span className="bj-card__corner" aria-hidden="true"><b>{rank}</b><i>{suit}</i></span>
        {pips ? <span className="bj-card__pips" aria-hidden="true">{pips.map(([row, column], i) => <i key={i} style={{ gridRow: row, gridColumn: column, transform: row > 3 ? 'rotate(180deg)' : undefined }}>{suit}</i>)}</span>
          : <span className={`bj-card__portrait ${rank === 'A' ? 'bj-card__portrait--ace' : ''}`} aria-hidden="true">{rank === 'A' ? suit : <><Crown /><b>{rank}</b><i>{suit}</i></>}</span>}
        <span className="bj-card__corner bj-card__corner--bottom" aria-hidden="true"><b>{rank}</b><i>{suit}</i></span>
      </>}
    </motion.div>
  </motion.div>;
}

function Cards({ cards, id }: { cards: (Card | null)[]; id: string }) {
  return <div className="bj-cards">{cards.length ? cards.map((card, index) =>
    <PlayingCard key={`${id}-${index}`} card={card} />
  ) : <><div className="bj-card-slot" aria-hidden="true">♠</div><div className="bj-card-slot" aria-hidden="true">♥</div></>}</div>;
}

function useBlackjackPresentation(hand: BJHand | null, round: BJRound | null, reducedMotion: boolean,
  onPresentationChange?: (busy: boolean) => void, onRoundRevealed?: (round: BJRound) => void) {
  const [view, setView] = useState(() => blackjackView(hand, round));
  const [animating, setAnimating] = useState(false);
  const currentView = useRef(view);
  const busy = useRef(false);
  const callbacks = useRef({ onPresentationChange, onRoundRevealed });
  callbacks.current = { onPresentationChange, onRoundRevealed };
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const source = hand ?? round;
  const sourceKey = source ? `${source.id}:${hand ? 'hand' : 'round'}:${source.player.join(',')}:${source.dealer.join(',')}` : 'empty';
  const previousSource = useRef(sourceKey);
  const setBusy = (value: boolean) => {
    if (busy.current === value) return;
    busy.current = value;
    setAnimating(value);
    callbacks.current.onPresentationChange?.(value);
  };
  const show = (next: typeof view) => { currentView.current = next; setView(next); };
  useLayoutEffect(() => {
    if (previousSource.current === sourceKey) return;
    previousSource.current = sourceKey;
    clearTimeout(fallback.current);
    setBusy(true);
    const steps = planBlackjackPresentation(currentView.current, hand, round, reducedMotion);
    steps.forEach(({ at, view: next }, index) => {
      const update = () => {
        show(next);
        if (index === steps.length - 1) {
          if (!hand && round) callbacks.current.onRoundRevealed?.(round);
          setBusy(false);
        }
      };
      if (at === 0) update();
      else timers.current.push(setTimeout(update, at));
    });
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  // Source identity, rather than parent rerenders, owns the running timeline.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    clearTimeout(fallback.current);
    if (busy.current) callbacks.current.onPresentationChange?.(false);
  }, []);

  const act = (action: () => void) => {
    if (busy.current) return;
    setBusy(true);
    // A rejected save leaves the model unchanged; release controls in that case.
    fallback.current = setTimeout(() => setBusy(false), 250);
    try { action(); } catch (error) { clearTimeout(fallback.current); setBusy(false); throw error; }
  };
  return { view, animating, act };
}

export function BlackjackTable({ balance, hand, rounds, disabled, onDeal, onHit, onStand, onDouble, onPresentationChange, onRoundRevealed }: BlackjackTableProps) {
  const reducedMotion = useReducedMotion();
  const [amount, setAmount] = useState('100');
  const [error, setError] = useState('');
  const id = useId();
  const last = rounds[0] ?? null;
  const { view, animating, act } = useBlackjackPresentation(hand, last, Boolean(reducedMotion), onPresentationChange, onRoundRevealed);
  const controlsDisabled = disabled || animating;
  const dealer = view.dealer;
  const player = view.player;
  const displayedId = view.id;
  const hiddenHole = dealer.includes(null) || view.dealerScoreCount < dealer.length;
  const dealerValue = handValue(dealer.slice(0, view.dealerScoreCount).filter((card): card is Card => card !== null));
  const playerValue = handValue(player);
  const stake = hand?.stake ?? last?.stake ?? 0n;
  const visibleLast = !hand && last?.id === view.id && view.phase === 'complete' ? last : null;
  const visibleRounds = !hand && last && !visibleLast ? rounds.filter(round => round.id !== last.id) : rounds;
  const selected = parseMoneyInput(amount);
  const balanceValid = typeof balance === 'bigint' && balance >= 0n;
  const maximum = balanceValid ? balance - balance % 2n : 0n;
  const canDouble = Boolean(hand && hand.player.length === 2 && balanceValid && balance >= hand.stake && !controlsDisabled);
  const net = visibleRounds.reduce((sum, round) => sum + round.net, 0n);
  const wins = visibleRounds.filter(round => round.outcome === 'win' || round.outcome === 'blackjack').length;

  function deal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controlsDisabled || hand) return;
    const value = parseMoneyInput(amount);
    if (value === null || !isBlackjackStake(value)) {
      setError('Введите положительную чётную сумму от 2 фишек. Ставки кратны 2.');
      return;
    }
    if (!balanceValid || value > balance) {
      setError('Недостаточно фишек для этой ставки.');
      return;
    }
    setError('');
    act(() => onDeal(value));
  }

  return <div className="blackjack" data-presentation={view.phase} aria-busy={animating}>
    <section className="bj-table" aria-label="Игровой стол блэкджека">
      <div className="bj-table__top"><span><i /> СТОЛ № 02 <b>·</b> BLACKJACK</span><span>ВЫПЛАТА 3:2 · ДИЛЕР СТОИТ НА 17</span></div>
      <div className="bj-felt">
        <div className="bj-felt__watermark" aria-hidden="true">21</div>
        <section className="bj-seat bj-seat--dealer" aria-label="Карты дилера">
          <div className="bj-seat__heading"><h3>Дилер</h3><span className={`bj-score ${!hiddenHole && dealerValue.bust ? 'bj-score--bust' : ''}`} aria-label={`Очки дилера: ${dealer.length ? `${dealerValue.total}${hiddenHole ? ' и закрытая карта' : ''}` : 'нет карт'}`}>{dealer.length ? <>{dealerValue.total}{hiddenHole && <small> + ?</small>}</> : '—'}</span></div>
          <Cards cards={dealer} id={`dealer-${displayedId}`} />
          <p className="bj-seat__note">{view.phase === 'dealing' ? 'Раздаём карты по очереди…' : hiddenHole ? 'Вторая карта закрыта до завершения вашего хода' : view.phase === 'dealer' ? 'Ход дилера: добор до 17'  : dealer.length ? dealerValue.bust ? 'У дилера перебор' : dealerValue.natural ? 'Блэкджек у дилера' : dealerValue.soft ? 'Мягкая рука' : 'Карты дилера открыты' : 'Дилер останавливается на любых 17'}</p>
        </section>

        <div className="bj-table__inscription" aria-hidden="true"><span /> БЛЭКДЖЕК 3:2 <span /></div>

        <section className="bj-seat bj-seat--player" aria-label="Ваши карты">
          <div className="bj-seat__heading"><h3>Ваша рука</h3><span className={`bj-score ${playerValue.bust ? 'bj-score--bust' : ''}`} aria-label={`Ваши очки: ${player.length ? playerValue.total : 'нет карт'}`}>{player.length ? playerValue.total : '—'}</span></div>
          <Cards cards={player} id={`player-${displayedId}`} />
          <p className="bj-seat__note">{view.phase === 'dealing' ? 'Карта идёт к вашей руке…' : player.length ? playerValue.bust ? 'Перебор: больше 21 очка' : playerValue.natural ? 'Туз и карта достоинством 10 — блэкджек' : playerValue.soft ? 'Туз считается за 11, пока это выгодно' : hand ? 'Ещё карту или хватит?' : 'Раздача завершена' : 'Выберите ставку и получите первые две карты'}</p>
        </section>

        <div className="bj-settlement">
        {visibleLast && <motion.div className={`bj-outcome bj-outcome--${last.outcome}`} initial={reducedMotion ? false : { opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reducedMotion ? 0 : .45, ease: 'easeOut' }} key={last.id} role="status">
          <span className="bj-outcome__label">{outcomeLabel[last.outcome]}</span>
          <strong className={last.net > 0n ? 'bj-positive' : last.net < 0n ? 'bj-negative' : ''}>{last.net > 0n ? '+' : ''}{money(last.net)} <small>фишек</small></strong>
          <span className="bj-outcome__return">Возврат: <b>{money(last.payout)}</b> · {last.doubled ? 'Удвоенная ставка' : 'Ставка'}: <b>{money(last.stake)}</b></span>
        </motion.div>}

        {hand && <div className="bj-active-stake"><Coins size={15} aria-hidden="true" /><span>В игре</span><strong>{money(stake)}</strong><span>фишек</span></div>}
        </div>
      </div>

      <div className="bj-controls">
        {hand ? <div className="bj-actions-panel"><div className="bj-actions-note"><Layers3 size={19} aria-hidden="true" /><span>{animating ? 'Раздача карт…' : 'Ваш ход'}<small>{animating ? 'Дождитесь, пока карта ляжет на стол' : 'Постарайтесь набрать 21, не перебрав'}</small></span></div><div className="bj-actions"><button type="button" className="bj-action bj-action--gold" disabled={controlsDisabled} onClick={() => act(onHit)}><Plus size={17} aria-hidden="true" />Ещё</button><button type="button" className="bj-action" disabled={controlsDisabled} onClick={() => act(onStand)}><ShieldCheck size={16} aria-hidden="true" />Хватит</button><button type="button" className="bj-action" disabled={!canDouble} onClick={() => act(onDouble)}><Layers3 size={16} aria-hidden="true" />Удвоить</button></div><p className="bj-double-note">Удвоение доступно только на первых двух картах при достаточном балансе. После него выдаётся одна карта.</p></div>
          : <form className="bj-stake-form" onSubmit={deal} noValidate>
            <div className="bj-stake-picker"><label htmlFor={`${id}-stake`}>ВАША СТАВКА</label><div className="bj-presets">{presets.map((value, index) => <button key={value.toString()} type="button" className={`bj-chip bj-chip--${index} ${selected === value ? 'is-selected' : ''}`} aria-label={`Ставка ${money(value)}`} aria-pressed={selected === value} disabled={controlsDisabled} onClick={() => { setAmount(value.toString()); setError(''); }}><span>{money(value)}</span></button>)}</div>
              <div className={`bj-custom-stake ${error ? 'has-error' : ''}`}><input id={`${id}-stake`} aria-label="Сумма ставки в блэкджеке" aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)} type="text" inputMode="numeric" autoComplete="off" value={amount} placeholder="Своя сумма" disabled={controlsDisabled} onChange={event => { setAmount(event.target.value); setError(''); }} /><span>фишек</span><button type="button" disabled={controlsDisabled || maximum < 2n} onClick={() => { setAmount(maximum.toString()); setError(''); }}>Максимум</button></div>
              <p id={`${id}-hint`} className="bj-stake-hint">Ставки кратны 2 · минимум 2 фишки · блэкджек оплачивается 3:2</p>{error && <p id={`${id}-error`} className="bj-error" role="alert">{error}</p>}
            </div>
            <button className="bj-deal" type="submit" disabled={controlsDisabled}><Play size={17} aria-hidden="true" />{animating ? 'Ход дилера…' : 'Раздать карты'}<span aria-hidden="true">→</span></button>
          </form>}
      </div>
    </section>

    <section className="bj-session" aria-label="Статистика блэкджека"><div className="bj-section-heading"><BarChart3 size={17} aria-hidden="true" /><h3>Ваша сессия в блэкджеке</h3></div><div className="bj-session__stats"><div><span>Раздач</span><strong>{visibleRounds.length}</strong></div><div><span>Побед</span><strong>{wins}</strong></div><div><span>Чистый результат</span><strong className={net > 0n ? 'bj-positive' : net < 0n ? 'bj-negative' : ''}>{net > 0n ? '+' : ''}{money(net)} <small>фишек</small></strong></div></div></section>

    <details className="bj-history"><summary><History size={17} aria-hidden="true" /><span>История блэкджека</span><small>{visibleRounds.length ? 'Последние 10 раздач' : 'Пока нет раздач'}</small><ChevronDown size={15} aria-hidden="true" /></summary>{visibleRounds.length ? <div className="bj-history__scroll"><table><thead><tr><th>Дата и время</th><th>Ставка</th><th>Результат</th><th>Возврат</th><th>Итог</th></tr></thead><tbody>{visibleRounds.slice(0, 10).map(round => <tr key={round.id}><td><time dateTime={round.date}>{new Date(round.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></td><td>{money(round.stake)}{round.doubled && <small>Удвоение</small>}</td><td>{outcomeLabel[round.outcome]}<small>{handValue(round.player).total} : {handValue(round.dealer).total}</small></td><td>{money(round.payout)}</td><td className={round.net > 0n ? 'bj-positive' : round.net < 0n ? 'bj-negative' : ''}>{round.net > 0n ? '+' : ''}{money(round.net)}</td></tr>)}</tbody></table></div> : <p className="bj-history__empty">Завершите первую раздачу — здесь появятся её результат и выплата.</p>}</details>
    <p className="bj-local-note"><ArrowDownToLine size={13} aria-hidden="true" /> История блэкджека хранится отдельно от рулетки. Баланс фишек общий.</p>
  </div>;
}
