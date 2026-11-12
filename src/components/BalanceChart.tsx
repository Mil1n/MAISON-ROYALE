import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { balanceCoordinates } from '../balanceChart';
import { money } from '../game';
import type { BalancePoint } from '../storage';
import '../balanceChart.css';

const labels: Record<BalancePoint['kind'], string> = {
  start: 'Начало наблюдения', roulette: 'Рулетка', blackjack: 'Блэкджек',
  baccarat: 'Баккара', videopoker:'Видеопокер', dice:'Кости', holdem:'Холдем', topup: 'Пополнение', reset: 'Сброс баланса',
};

export function BalanceChart({ points }: { points: BalancePoint[] }) {
  const [windowSize, setWindowSize] = useState(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = windowSize === 0 ? points : points.slice(-windowSize);
  const { coordinates, minimum, maximum } = balanceCoordinates(visible);
  const selectedIndex = selectedId === null ? -1 : visible.findIndex(p => p.id === selectedId);
  const index = selectedIndex < 0 ? visible.length - 1 : selectedIndex;
  const selected = visible[index];
  const mark = coordinates[index];
  const line = coordinates.map(p => `${p.x},${p.y}`).join(' ');
  return <section className="balance-chart" aria-labelledby="balance-chart-title">
    <div className="balance-chart-heading"><h2 id="balance-chart-title"><BarChart3 size={18} /> Изменение баланса</h2>
      <label>Период <select aria-label="Период графика баланса" value={windowSize} onChange={e => { setWindowSize(Number(e.target.value)); setSelectedId(null); }}>
        <option value={30}>30 событий</option><option value={100}>100 событий</option><option value={0}>Вся история</option>
      </select></label>
    </div>
    {selected ? <>
      <div className="balance-chart-values"><span>Максимум <b>{money(maximum)}</b></span><span>Минимум <b>{money(minimum)}</b></span></div>
      <svg viewBox="0 0 1000 220" preserveAspectRatio="none" role="img" aria-label={`Баланс по ${visible.length} событиям. Минимум ${money(minimum)}, максимум ${money(maximum)} фишек.`}>
        {[30, 110, 190].map(y => <line key={y} x1="20" x2="980" y1={y} y2={y} className="balance-chart-grid" />)}
        {coordinates.length > 1 && <polygon points={`20,205 ${line} 980,205`} className="balance-chart-fill" />}
        <polyline points={line} className="balance-chart-line" />
        <line x1={mark.x} x2={mark.x} y1="20" y2="205" className="balance-chart-cursor" />
        <circle cx={mark.x} cy={mark.y} r="5" className="balance-chart-dot" />
      </svg>
      <label className="balance-chart-slider">Выберите событие
        <input type="range" min={0} max={visible.length - 1} value={index} disabled={visible.length < 2}
          aria-label="Событие на графике баланса" aria-valuetext={`${labels[selected.kind]}: ${money(selected.balance)} фишек`}
          onChange={e => setSelectedId(visible[Number(e.target.value)].id)} />
      </label>
      <div className="balance-chart-selection" aria-live="polite"><span>{labels[selected.kind]} <time dateTime={selected.date}>{new Date(selected.date).toLocaleString('ru-RU')}</time></span><strong>{money(selected.balance)} <small>фишек</small></strong></div>
    </> : <p className="balance-chart-empty">Завершите первый раунд или пополните баланс — здесь начнётся график.</p>}
    <p className="balance-chart-note">Общий баланс после завершённых раундов, с учётом пополнений и сбросов. Фишки в незавершённых ставках включены. Храним последние 1 000 событий; для старых сохранений график начинается с первого нового события.</p>
  </section>;
}
