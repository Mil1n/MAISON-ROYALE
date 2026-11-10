import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, CreditCard, Landmark, ShieldCheck, Wallet } from 'lucide-react';
import { money } from '../game';
import '../withdrawal.css';

type WithdrawalProps = {
  balance: number;
  imageSrc: string;
  onClose: () => void;
};

type Method = 'sbp' | 'card';

export function Withdrawal({ balance, imageSrc, onClose }: WithdrawalProps) {
  const [method, setMethod] = useState<Method>('sbp');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'form' | 'result'>('form');
  const closeRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const amountId = `${id}-amount`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const validBalance = Number.isFinite(balance) && Number.isSafeInteger(balance) && balance >= 0;

  useEffect(() => {
    if (stage === 'result') closeRef.current?.focus();
  }, [stage]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = amount.replace(/\s/g, '');
    const value = /^\d+$/.test(digits) ? Number(digits) : NaN;
    if (!validBalance) {
      setError('Не удалось определить доступный баланс. Закройте окно и попробуйте снова.');
      return;
    }
    if (!Number.isSafeInteger(value) || value <= 0) {
      setError('Введите положительную целую сумму.');
      return;
    }
    if (value > balance) {
      setError('Сумма превышает доступный баланс.');
      return;
    }
    setError('');
    setStage('result');
  }

  if (stage === 'result') {
    return (
      <div className="withdrawal withdrawal--result">
        <figure className="withdrawal__result">
          <img
            className="withdrawal__result-image"
            src={imageSrc}
            alt="Горилла — шуточный результат вывода средств"
          />
          <figcaption className="withdrawal__result-caption" role="status">
            Это игровой розыгрыш. Вывод не списывает фишки с баланса.
          </figcaption>
        </figure>
        <button ref={closeRef} type="button" className="withdrawal__submit" onClick={onClose}>
          Закрыть
        </button>
      </div>
    );
  }

  return (
    <div className="withdrawal">
      <p className="withdrawal__intro">Выберите способ и сумму вывода виртуальных фишек.</p>
      <div className="withdrawal__balance">
        <span className="withdrawal__balance-label"><Wallet size={16} aria-hidden="true" /> Доступно к выводу</span>
        <strong>{validBalance ? money(balance) : '—'} <small>фишек</small></strong>
      </div>

      <form className="withdrawal__form" onSubmit={submit} noValidate>
        <fieldset className="withdrawal__methods">
          <legend>Способ вывода</legend>
          <div className="withdrawal__method-grid">
            <label className={`withdrawal__method ${method === 'sbp' ? 'is-selected' : ''}`}>
              <input type="radio" aria-label="СБП" name={`${id}-method`} value="sbp" checked={method === 'sbp'} onChange={() => setMethod('sbp')} />
              <Landmark size={21} aria-hidden="true" />
              <span>СБП<small>Демо-счёт</small></span>
              <span className="withdrawal__radio" aria-hidden="true" />
            </label>
            <label className={`withdrawal__method ${method === 'card' ? 'is-selected' : ''}`}>
              <input type="radio" aria-label="Банковская карта" name={`${id}-method`} value="card" checked={method === 'card'} onChange={() => setMethod('card')} />
              <CreditCard size={21} aria-hidden="true" />
              <span>Банковская карта<small>Демо-карта</small></span>
              <span className="withdrawal__radio" aria-hidden="true" />
            </label>
          </div>
        </fieldset>

        <div className="withdrawal__recipient" aria-live="polite">
          <span>Получатель</span>
          <strong>{method === 'sbp' ? 'Демонстрационный счёт СБП' : 'Демо-карта •••• 0000'}</strong>
          <small>Учебный пример · реквизиты не нужны</small>
        </div>

        <div className="withdrawal__amount-field">
          <label htmlFor={amountId}>Сумма вывода</label>
          <div className={`withdrawal__amount-box ${error ? 'has-error' : ''}`}>
            <input
              id={amountId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="Например, 1 000"
              value={amount}
              onChange={event => { setAmount(event.target.value); setError(''); }}
              aria-invalid={Boolean(error)}
              aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
            />
            <span className="withdrawal__amount-unit">фишек</span>
            <button
              type="button"
              className="withdrawal__max"
              disabled={!validBalance || balance === 0}
              onClick={() => { setAmount(String(balance)); setError(''); }}
            >
              Всё
            </button>
          </div>
          <p id={hintId} className="withdrawal__hint">Целое число от 1 до доступного баланса.</p>
          {error && <p id={errorId} className="withdrawal__error" role="alert">{error}</p>}
        </div>

        <button type="submit" className="withdrawal__submit">
          Вывести средства <ArrowUpRight size={17} aria-hidden="true" />
        </button>
        <p className="withdrawal__demo-note"><ShieldCheck size={15} aria-hidden="true" /><span>Демонстрационная форма. Реальные выплаты не выполняются.</span></p>
      </form>
    </div>
  );
}
