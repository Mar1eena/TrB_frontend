// Общие шкалы для графиков поиска 2.0 (история оптимизации, slice, parallel
// coordinates) — единственная разделяемая утилита между ними, чтобы не
// дублировать линейную/категориальную интерполяцию в каждом компоненте.

export function linearScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) {
    const mid = (r0 + r1) / 2;
    return () => mid;
  }
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

// Немного расширяет числовой домен по краям, чтобы точки не упирались в
// рамку графика; вырожденный домен (min === max) разводится на единицу.
export function niceDomain(values: number[]): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [0, 1];
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

export type CategoricalScale = { scale: (v: string) => number; values: string[] };

export function categoricalScale(values: string[], range: [number, number]): CategoricalScale {
  const uniq = [...new Set(values)];
  const n = uniq.length;
  const mid = (range[0] + range[1]) / 2;
  const pos = new Map(uniq.map((v, i) => [v, n <= 1 ? mid : range[0] + (i / (n - 1)) * (range[1] - range[0])]));
  return { scale: (v: string) => pos.get(v) ?? mid, values: uniq };
}
