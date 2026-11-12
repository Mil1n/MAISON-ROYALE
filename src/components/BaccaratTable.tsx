import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cardLabel, cardRank, cardSuit, type Card } from '../blackjack';
import { baccaratValue, isBaccaratStake, type BaccaratBet, type BaccaratRound } from '../baccarat';
import { money, parseMoneyInput } from '../game';
import '../baccarat.css';

export type BaccaratTableProps = {
  balance: bigint;
  rounds: BaccaratRound[];
  disabled: boolean;
  durationScale?: number;
  onDeal: (stake: bigint, bet: BaccaratBet) => void;
  onPresentationChange?: (busy: boolean) => void;
  onRoundRevealed?: (round: BaccaratRound) => void;
};
const labels: Record<BaccaratBet, string> = { player: 'Игрок', banker: 'Банкир', tie: 'Ничья' };
const odds: Record<BaccaratBet, string> = { player: '1:1', banker: '0,95:1', tie: '8:1' };
const options = ['player', 'banker', 'tie'] as const;
const presets = [100n, 500n, 1000n, 5000n];
const order = (round: BaccaratRound) => [
  { side: 'player' as const, card: round.player[0] },
  { side: 'banker' as const, card: round.banker[0] },
  { side: 'player' as const, card: round.player[1] },
  { side: 'banker' as const, card: round.banker[1] },
  ...(round.player.length === 3 ? [{ side: 'player' as const, card: round.player[2] }] : []),
  ...(round.banker.length === 3 ? [{ side: 'banker' as const, card: round.banker[2] }] : []),
];

function CardFace({ card, durationScale, reduced }: { card: Card; durationScale: number; reduced: boolean }) {
  const suit = cardSuit(card), rank = cardRank(card), red = suit === '♥' || suit === '♦';
  return <motion.div className={`baccarat-card ${red ? 'baccarat-card--red' : ''}`} role="img" aria-label={`Карта ${cardLabel(card)}`}
    initial={reduced ? false : { opacity: 0, x: 28, y: -24, rotate: -8 }}
    animate={{ opacity: 1, x: 0, y: 0, rotate: 0 }} transition={{ duration: reduced ? 0 : .32 * durationScale, ease: 'easeOut' }}>
    <span className="baccarat-card__corner" aria-hidden="true"><b>{rank}</b>{suit}</span>
    <span className="baccarat-card__suit" aria-hidden="true">{suit}</span>
    <span className="baccarat-card__corner baccarat-card__corner--bottom" aria-hidden="true"><b>{rank}</b>{suit}</span>
  </motion.div>;
}

export function BaccaratTable({ balance, rounds, disabled, durationScale = 1, onDeal, onPresentationChange, onRoundRevealed }: BaccaratTableProps) {
  const reduced = Boolean(useReducedMotion());
  const scale = Number.isFinite(durationScale) ? Math.max(.25, Math.min(3, durationScale)) : 1;
  const last = rounds[0] ?? null;
  const [presented, setPresented] = useState(last);
  const [count, setCount] = useState(last ? order(last).length : 0);
  const [animating, setAnimating] = useState(false);
  const [amount, setAmount] = useState('100');
  const [bet, setBet] = useState<BaccaratBet>('player');
  const [error, setError] = useState('');
  const source = useRef(last?.id);
  const busy = useRef(false);
  const callbacks = useRef({ onPresentationChange, onRoundRevealed });
  callbacks.current = { onPresentationChange, onRoundRevealed };
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setBusy = (value: boolean) => {
    busy.current = value; setAnimating(value); callbacks.current.onPresentationChange?.(value);
  };
  useLayoutEffect(() => {
    if (source.current === last?.id) return;
    source.current = last?.id;
    clearTimeout(fallback.current);
    timers.current.forEach(clearTimeout); timers.current = [];
    setPresented(last);
    if (!last) { setCount(0); setBusy(false); return; }
    const sequence = order(last);
    if (reduced) {
      setCount(sequence.length); callbacks.current.onRoundRevealed?.(last); setBusy(false); return;
    }
    setCount(0); setBusy(true);
    sequence.forEach((_, index) => timers.current.push(setTimeout(() => setCount(index + 1), (120 + index * 460) * scale)));
    timers.current.push(setTimeout(() => {
      callbacks.current.onRoundRevealed?.(last); setBusy(false);
    }, (120 + (sequence.length - 1) * 460 + 440) * scale));
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    // The new round owns the timeline. Settings are disabled while it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id]);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout); clearTimeout(fallback.current);
    if (busy.current) callbacks.current.onPresentationChange?.(false);
  }, []);

  const current = presented?.id === last?.id ? presented : null;
  const sequence = current ? order(current).slice(0, count) : [];
  const player = sequence.filter(item => item.side === 'player').map(item => item.card);
  const banker = sequence.filter(item => item.side === 'banker').map(item => item.card);
  const complete = Boolean(current && !animating && count === order(current).length);
  const visibleRounds = last && !complete ? rounds.filter(round => round.id !== last.id) : rounds;
  const controlsDisabled = disabled || animating;
  const chosen = parseMoneyInput(amount);
  const maximum = balance - balance % 20n;
  const net = visibleRounds.reduce((sum, round) => sum + round.net, 0n);
  const id = useId();
  function deal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controlsDisabled || busy.current) return;
    const stake = parseMoneyInput(amount);
    if (stake === null || !isBaccaratStake(stake)) { setError('Ставка от 20 фишек, кратная 20. Например, 100 или 500.'); return; }
    if (stake > balance) { setError('Недостаточно фишек. Уменьшите ставку или пополните баланс.'); return; }
    setError(''); setBusy(true);
    fallback.current = setTimeout(() => setBusy(false), 250);
    try { onDeal(stake, bet); }
    catch (cause) { clearTimeout(fallback.current); setBusy(false); throw cause; }
  }

  return <div className="baccarat" aria-busy={animating} data-presentation={animating ? 'dealing' : 'complete'}>
    <section className="baccarat-table" aria-label="Игровой стол баккары">
      <div className="baccarat-topline"><span><i /> СТОЛ № 03 · PUNTO BANCO</span><span>БЛИЖЕ К ДЕВЯТИ — БЛИЖЕ К ПОБЕДЕ</span></div>
      <div className="baccarat-felt">
        <div className="baccarat-inscription" aria-hidden="true"><span>MAISON ROYALE</span><strong>BACCARAT</strong><small>THE ART OF NINE</small></div>
        <div className="baccarat-hands">
          {(['player', 'banker'] as const).map(side => {
            const cards = side === 'player' ? player : banker;
            return <section key={side} className={`baccarat-hand baccarat-hand--${side}`} aria-label={`Карты: ${labels[side]}`}>
              <div className="baccarat-hand__heading"><h3>{labels[side]}</h3><span aria-label={`Очки: ${cards.length ? baccaratValue(cards) : 'нет карт'}`}>{cards.length ? baccaratValue(cards) : '—'}</span></div>
              <div className="baccarat-cards">{cards.length ? cards.map((card, index) => <CardFace key={`${current?.id}-${index}`} card={card} durationScale={scale} reduced={reduced} />) : <><div className="baccarat-slot" aria-hidden="true">♠</div><div className="baccarat-slot" aria-hidden="true">♥</div></>}</div>
              <p>{side === 'banker' ? 'Победа: 0,95:1 · комиссия 5%' : 'Победа: 1:1 · при ничьей возврат'}</p>
            </section>;
          })}
        </div>
        <div className="baccarat-settlement" aria-live="polite">
          {animating ? <p className="baccarat-dealing">Раздаём карты по очереди…<small>Результат появится после последней карты</small></p>
            : complete && current ? <motion.div className="baccarat-result" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <span>{current.winner === 'tie' ? 'Ничья' : `Победил ${labels[current.winner].toLowerCase()}`}</span>
              <strong className={current.net > 0n ? 'positive' : current.net < 0n ? 'negative' : ''}>{current.net > 0n ? '+' : ''}{money(current.net)} <small>фишек</small></strong>
              <small>Ваша ставка: {labels[current.bet]} · {money(current.stake)} · Возврат: {money(current.payout)}</small>
            </motion.div> : <p className="baccarat-dealing">На чьей стороне девятка?<small>Выберите исход и сделайте ставку</small></p>}
        </div>
      </div>
      <form className="baccarat-controls" onSubmit={deal}>
        <fieldset disabled={controlsDisabled} className="baccarat-bets"><legend>НА КОГО СТАВИМ</legend>{options.map(option => <label key={option} className={`baccarat-bet ${bet === option ? 'is-selected' : ''}`}><input type="radio" name={`baccarat-${id}`} value={option} checked={bet === option} onChange={() => setBet(option)} /><span>{labels[option]}<small>{odds[option]}</small></span></label>)}</fieldset>
        <div className="baccarat-stake"><label htmlFor={id}>ВАША СТАВКА</label><div className="baccarat-presets">{presets.map(stake => <button key={stake.toString()} type="button" disabled={controlsDisabled} aria-pressed={chosen === stake} onClick={() => setAmount(stake.toString())}>{money(stake)}</button>)}</div><div className="baccarat-input"><input id={id} inputMode="numeric" type="text" value={amount} disabled={controlsDisabled} aria-describedby={`${id}-hint`} aria-invalid={Boolean(error)} onChange={event => { setAmount(event.target.value); setError(''); }} /><span>фишек</span><button type="button" disabled={controlsDisabled || maximum < 20n} onClick={() => { setAmount(maximum.toString()); setError(''); }}>Максимум</button></div><p id={`${id}-hint`}>От 20 фишек · шаг 20 · все выплаты без округления</p></div>
        <button className="baccarat-deal" type="submit" disabled={controlsDisabled || chosen === null || !isBaccaratStake(chosen) || chosen > balance}>{animating ? 'Раздаём карты…' : 'Раздать карты'} <span>→</span></button>
        {error && <p className="baccarat-error" role="alert">{error}</p>}
      </form>
    </section>
    <section className="baccarat-session" aria-label="Статистика баккары"><h3>Ваша сессия в баккаре</h3><div><p><span>Раздач</span><strong>{visibleRounds.length}</strong></p><p><span>Победных ставок</span><strong>{visibleRounds.filter(round => round.net > 0n).length}</strong></p><p><span>Чистый результат</span><strong className={net > 0n ? 'positive' : net < 0n ? 'negative' : ''}>{net > 0n ? '+' : ''}{money(net)}</strong></p></div></section>
    <details className="baccarat-history"><summary>История баккары <span>{visibleRounds.length ? `${visibleRounds.length} раздач` : 'Пока нет раздач'}</span></summary>{visibleRounds.length ? <div className="baccarat-history__scroll"><table><thead><tr><th>Время</th><th>Ставка</th><th>Карты и очки</th><th>Итог</th></tr></thead><tbody>{visibleRounds.slice(0,100).map(round => <tr key={round.id}><td>{new Date(round.date).toLocaleString('ru-RU')}</td><td>{labels[round.bet]} · {money(round.stake)}</td><td>Игрок: {round.player.map(cardLabel).join(' ')} = {baccaratValue(round.player)}<br />Банкир: {round.banker.map(cardLabel).join(' ')} = {baccaratValue(round.banker)}</td><td className={round.net > 0n ? 'positive' : round.net < 0n ? 'negative' : ''}>{round.net > 0n ? '+' : ''}{money(round.net)}<small>Возврат: {money(round.payout)}</small></td></tr>)}</tbody></table>{visibleRounds.length > 100 && <p className="baccarat-history__limit">Показаны последние 100 раздач из {visibleRounds.length}. Полная история доступна в экспорте JSON.</p>}</div> : <p>Сыграйте первую раздачу — она появится здесь.</p>}</details>
    <p className="baccarat-note">Шесть свежих колод в каждой раздаче. Добор выполняется автоматически по правилам Punto Banco. Только виртуальные фишки.</p>
  </div>;
}
