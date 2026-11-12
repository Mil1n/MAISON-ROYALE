import { describe, expect, it } from 'vitest';
import { balanceCoordinates } from './balanceChart';
const point = (balance: bigint, index: number) => ({id: String(index), date: '2026-11-12T00:00:00Z', balance, kind: 'roulette' as const});
describe('balance graph coordinates', () => {
  it('keeps huge wallets finite and preserves small differences between huge balances', () => {
    const base = 10n ** 400n;
    const result = balanceCoordinates([base, base + 1n, base + 2n].map(point));
    expect(result.coordinates).toEqual([{x:20,y:190},{x:500,y:110},{x:980,y:30}]);
    expect(result.minimum).toBe(base);
    expect(result.maximum).toBe(base + 2n);
  });
  it('handles empty and constant balances without division by zero', () => {
    expect(balanceCoordinates([]).coordinates).toEqual([]);
    expect(balanceCoordinates([point(0n,0)]).coordinates).toEqual([{x:500,y:110}]);
    expect(balanceCoordinates([point(100n,0), point(100n,1)]).coordinates.every(p => p.y === 110)).toBe(true);
  });
});
