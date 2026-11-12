import type { BalancePoint } from './storage';

/** Normalize exact integers before converting to SVG coordinates, even for huge wallets. */
export function balanceCoordinates(points: readonly BalancePoint[]) {
  if (!points.length) return { coordinates: [], minimum: 0n, maximum: 0n };
  const minimum = points.reduce((n, point) => point.balance < n ? point.balance : n, points[0].balance);
  const maximum = points.reduce((n, point) => point.balance > n ? point.balance : n, points[0].balance);
  const range = maximum - minimum;
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? 500 : 20 + index / (points.length - 1) * 960,
    y: range === 0n ? 110 : 190 - Number((point.balance - minimum) * 1_000_000n / range) / 1_000_000 * 160,
  }));
  return { coordinates, minimum, maximum };
}
