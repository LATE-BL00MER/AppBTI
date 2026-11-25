const digits = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('ko-KR', { style: 'percent', maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined, unit = '') {
  if (value == null || !Number.isFinite(value)) return '데이터 없음';
  if (value > 0 && unit === 'ratio' && value < 0.0005) return '0.1% 미만';
  if (value > 0 && unit && unit !== 'ratio' && value < 0.05) return `0.1${unit} 미만`;
  return unit === 'ratio' ? percent.format(value) : `${digits.format(value)}${unit}`;
}

export function niceAxis(values: readonly (number | null)[], unit = '') {
  const max = values.reduce<number>((top, value) => value == null || !Number.isFinite(value) ? top : Math.max(top, value), 0);
  const stepSize = Math.max(1, max / 4);
  const magnitude = 10 ** Math.floor(Math.log10(stepSize));
  const step = magnitude * ([1, 2, 5, 10].find(value => value * magnitude >= stepSize) ?? 10);
  const count = Math.max(1, Math.ceil(max / step));
  const domain: [number, number] = [0, count * step];
  return { domain, ticks: Array.from({ length: count + 1 }, (_, index) => index * step),
    tickFormatter: (value: number) => formatNumber(value, unit), allowDecimals: false };
}

export function ratioScale(values: readonly (number | null)[]) {
  const extent = values.reduce<number>((top, value) => value != null && value > 0 && Number.isFinite(value)
    ? Math.max(top, Math.abs(Math.log2(value))) : top, 1);
  const limit = Math.ceil(extent);
  const step = Math.ceil(limit / 2);
  const ticks = [-limit, -step, 0, step, limit].filter((value, i, values) => values.indexOf(value) === i);
  return { position: (value: number) => value > 0 ? 50 + 50 * Math.log2(value) / limit : 0,
    ticks: ticks.map(value => 2 ** value) };
}
