import { useId, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDownToLine, BarChart3, ChevronDown, Coins, Crown, History, Layers3, Play, Plus, ShieldCheck } from 'lucide-react';
import { cardLabel, cardRank, cardSuit, handValue, isBlackjackStake, type BJHand, type BJRound, type Card } from '../blackjack';
import { money, parseMoneyInput } from '../game';
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

/** Hidden cards receive no Card value, including no label or data attribute. */
function PlayingCard({ card, index }: { card: Card | null; index: number }) {
  const reducedMotion = useReducedMotion();
  if (card === null) {
    return (
      <motion.div
        className="bj-card bj-card--back"
        role="img"
        aria-label="Закрытая карта дилера"
        initial={reducedMotion ? false : { opacity: 0, y: -25, rotate: -4 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: reducedMotion ? 0 : .3, delay: reducedMotion ? 0 : index * .055 }}
      >
        <div className="bj-card__back-frame" aria-hidden="true"><Crown /><span>MR</span><i>MAISON ROYALE</i></div>
      </motion.div>
    );
  }
  const rank = cardRank(card);
  const suit = cardSuit(card);
  const red = suit === '♥' || suit === '♦';
  const pips = pipPositions[Number(rank)];
  return (
    <motion.div
      className={`bj-card ${red ? 'bj-card--red' : 'bj-card--black'}`}
      role="img"
      aria-label={`Карта ${cardLabel(card)}`}
      initial={reducedMotion ? false : { opacity: 0, y: -25, rotateY: 75, rotate: 3 }}
      animate={{ opacity: 1, y: 0, rotateY: 0, rotate: 0 }}
      transition={{ duration: reducedMotion ? 0 : .3, delay: reducedMotion ? 0 : index * .055 }}
    >
      <span className="bj-card__corner" aria-hidden="true"><b>{rank}</b><i>{suit}</i></span>
      {pips ? <span className="bj-card__pips" aria-hidden="true">{pips.map(([row, column], i) => <i key={i} style={{ gridRow: row, gridColumn: column, transform: row > 3 ? 'rotate(180deg)' : undefined }}>{suit}</i>)}</span>
        : <span className={`bj-card__portrait ${rank === 'A' ? 'bj-card__portrait--ace' : ''}`} aria-hidden="true">{rank === 'A' ? suit : <><Crown /><b>{rank}</b><i>{suit}</i></>}</span>}
      <span className="bj-card__corner bj-card__corner--bottom" aria-hidden="true"><b>{rank}</b><i>{suit}</i></span>
    </motion.div>
  );
}

function Cards({ cards, hideHole, id }: { cards: Card[]; hideHole: boolean; id: string }) {
  return <div className="bj-cards">{cards.length ? cards.map((card, index) => {
    const hidden = hideHole && index > 0;
    return <PlayingCard key={`${id}-${index}-${hidden ? 'hidden' : 'face'}`} card={hidden ? null : card} index={index} />;
  }) : <><div className="bj-card-slot" aria-hidden="true">♠</div><div className="bj-card-slot" aria-hidden="true">♥</div></>}</div>;
}

export function BlackjackTable({ balance, hand, rounds, disabled, onDeal, onHit, onStand, onDouble }: BlackjackTableProps) {
  const reducedMotion = useReducedMotion();
  const [amount, setAmount] = useState('100');
  const [error, setError] = useState('');
  const id = useId();
  const last = rounds[0] ?? null;
  const dealer = hand?.dealer ?? last?.dealer ?? [];
  const player = hand?.player ?? last?.player ?? [];
  const displayedId = hand?.id ?? last?.id ?? 'empty';
  const dealerValue = handValue(hand ? dealer.slice(0, 1) : dealer);
  const playerValue = handValue(player);
  const stake = hand?.stake ?? last?.stake ?? 0n;
  const selected = parseMoneyInput(amount);
  const balanceValid = typeof balance === 'bigint' && balance >= 0n;
  const maximum = balanceValid ? balance - balance % 2n : 0n;
  const canDouble = Boolean(hand && hand.player.length === 2 && balanceValid && balance >= hand.stake && !disabled);
  const net = rounds.reduce((sum, round) => sum + round.net, 0n);
  const wins = rounds.filter(round => round.outcome === 'win' || round.outcome === 'blackjack').length;

  function deal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || hand) return;
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
    onDeal(value);
  }

  return <div className="blackjack">
    <section className="bj-table" aria-label="Игровой стол блэкджека">
      <div className="bj-table__top"><span><i /> СТОЛ № 02 <b>·</b> BLACKJACK</span><span>ВЫПЛАТА 3:2 · ДИЛЕР СТОИТ НА 17</span></div>
      <div className="bj-felt">
        <div className="bj-felt__watermark" aria-hidden="true">21</div>
        <section className="bj-seat bj-seat--dealer" aria-label="Карты дилера">
          <div className="bj-seat__heading"><h3>Дилер</h3><span className={`bj-score ${!hand && dealerValue.bust ? 'bj-score--bust' : ''}`} aria-label={`Очки дилера: ${dealer.length ? `${dealerValue.total}${hand ? ' и закрытая карта' : ''}` : 'нет карт'}`}>{dealer.length ? <>{dealerValue.total}{hand && <small> + ?</small>}</> : '—'}</span></div>
          <Cards cards={dealer} hideHole={Boolean(hand)} id={`dealer-${displayedId}`} />
          <p className="bj-seat__note">{hand ? 'Вторая карта закрыта до завершения вашего хода' : dealer.length ? dealerValue.bust ? 'У дилера перебор' : dealerValue.natural ? 'Блэкджек у дилера' : dealerValue.soft ? 'Мягкая рука' : 'Карты дилера открыты' : 'Дилер останавливается на любых 17'}</p>
        </section>

        <div className="bj-table__inscription" aria-hidden="true"><span /> БЛЭКДЖЕК 3:2 <span /></div>

        <section className="bj-seat bj-seat--player" aria-label="Ваши карты">
          <div className="bj-seat__heading"><h3>Ваша рука</h3><span className={`bj-score ${playerValue.bust ? 'bj-score--bust' : ''}`} aria-label={`Ваши очки: ${player.length ? playerValue.total : 'нет карт'}`}>{player.length ? playerValue.total : '—'}</span></div>
          <Cards cards={player} hideHole={false} id={`player-${displayedId}`} />
          <p className="bj-seat__note">{player.length ? playerValue.bust ? 'Перебор: больше 21 очка' : playerValue.natural ? 'Туз и карта достоинством 10 — блэкджек' : playerValue.soft ? 'Туз считается за 11, пока это выгодно' : hand ? 'Ещё карту или хватит?' : 'Раздача завершена' : 'Выберите ставку и получите первые две карты'}</p>
        </section>

        {!hand && last && <motion.div className={`bj-outcome bj-outcome--${last.outcome}`} initial={reducedMotion ? false : { opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .25 }} key={last.id} role="status">
          <span className="bj-outcome__label">{outcomeLabel[last.outcome]}</span>
          <strong className={last.net > 0n ? 'bj-positive' : last.net < 0n ? 'bj-negative' : ''}>{last.net > 0n ? '+' : ''}{money(last.net)} <small>фишек</small></strong>
          <span className="bj-outcome__return">Возврат: <b>{money(last.payout)}</b> · {last.doubled ? 'Удвоенная ставка' : 'Ставка'}: <b>{money(last.stake)}</b></span>
        </motion.div>}

        {hand && <div className="bj-active-stake"><Coins size={15} aria-hidden="true" /><span>В игре</span><strong>{money(stake)}</strong><span>фишек</span></div>}
      </div>

      <div className="bj-controls">
        {hand ? <div className="bj-actions-panel"><div className="bj-actions-note"><Layers3 size={19} aria-hidden="true" /><span>Ваш ход<small>Постарайтесь набрать 21, не перебрав</small></span></div><div className="bj-actions"><button type="button" className="bj-action bj-action--gold" disabled={disabled} onClick={onHit}><Plus size={17} aria-hidden="true" />Ещё</button><button type="button" className="bj-action" disabled={disabled} onClick={onStand}><ShieldCheck size={16} aria-hidden="true" />Хватит</button><button type="button" className="bj-action" disabled={!canDouble} onClick={onDouble}><Layers3 size={16} aria-hidden="true" />Удвоить</button></div><p className="bj-double-note">Удвоение доступно только на первых двух картах при достаточном балансе. После него выдаётся одна карта.</p></div>
          : <form className="bj-stake-form" onSubmit={deal} noValidate>
            <div className="bj-stake-picker"><label htmlFor={`${id}-stake`}>ВАША СТАВКА</label><div className="bj-presets">{presets.map((value, index) => <button key={value.toString()} type="button" className={`bj-chip bj-chip--${index} ${selected === value ? 'is-selected' : ''}`} aria-label={`Ставка ${money(value)}`} aria-pressed={selected === value} disabled={disabled} onClick={() => { setAmount(value.toString()); setError(''); }}><span>{money(value)}</span></button>)}</div>
              <div className={`bj-custom-stake ${error ? 'has-error' : ''}`}><input id={`${id}-stake`} aria-label="Сумма ставки в блэкджеке" aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)} type="text" inputMode="numeric" autoComplete="off" value={amount} placeholder="Своя сумма" disabled={disabled} onChange={event => { setAmount(event.target.value); setError(''); }} /><span>фишек</span><button type="button" disabled={disabled || maximum < 2n} onClick={() => { setAmount(maximum.toString()); setError(''); }}>Максимум</button></div>
              <p id={`${id}-hint`} className="bj-stake-hint">Ставки кратны 2 · минимум 2 фишки · блэкджек оплачивается 3:2</p>{error && <p id={`${id}-error`} className="bj-error" role="alert">{error}</p>}
            </div>
            <button className="bj-deal" type="submit" disabled={disabled}><Play size={17} aria-hidden="true" />Раздать карты<span aria-hidden="true">→</span></button>
          </form>}
      </div>
    </section>

    <section className="bj-session" aria-label="Статистика блэкджека"><div className="bj-section-heading"><BarChart3 size={17} aria-hidden="true" /><h3>Ваша сессия в блэкджеке</h3></div><div className="bj-session__stats"><div><span>Раздач</span><strong>{rounds.length}</strong></div><div><span>Побед</span><strong>{wins}</strong></div><div><span>Чистый результат</span><strong className={net > 0n ? 'bj-positive' : net < 0n ? 'bj-negative' : ''}>{net > 0n ? '+' : ''}{money(net)} <small>фишек</small></strong></div></div></section>

    <details className="bj-history"><summary><History size={17} aria-hidden="true" /><span>История блэкджека</span><small>{rounds.length ? 'Последние 10 раздач' : 'Пока нет раздач'}</small><ChevronDown size={15} aria-hidden="true" /></summary>{rounds.length ? <div className="bj-history__scroll"><table><thead><tr><th>Дата и время</th><th>Ставка</th><th>Результат</th><th>Возврат</th><th>Итог</th></tr></thead><tbody>{rounds.slice(0, 10).map(round => <tr key={round.id}><td><time dateTime={round.date}>{new Date(round.date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></td><td>{money(round.stake)}{round.doubled && <small>Удвоение</small>}</td><td>{outcomeLabel[round.outcome]}<small>{handValue(round.player).total} : {handValue(round.dealer).total}</small></td><td>{money(round.payout)}</td><td className={round.net > 0n ? 'bj-positive' : round.net < 0n ? 'bj-negative' : ''}>{round.net > 0n ? '+' : ''}{money(round.net)}</td></tr>)}</tbody></table></div> : <p className="bj-history__empty">Завершите первую раздачу — здесь появятся её результат и выплата.</p>}</details>
    <p className="bj-local-note"><ArrowDownToLine size={13} aria-hidden="true" /> История блэкджека хранится отдельно от рулетки. Баланс фишек общий.</p>
  </div>;
}
