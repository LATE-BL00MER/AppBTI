import { formatNumber, ratioScale } from '../api/numbers';
import type { ReactNode } from 'react';

export type RatioRow = { id: string; label: ReactNode; value: number | null; highlight?: boolean };

export default function RatioBars({ rows, label }: { rows: RatioRow[]; label: string }) {
  const { position, ticks } = ratioScale(rows.map(row => row.value));
  return <div className="ratio-bars" aria-label={label}>
    <div className="ratio-axis" aria-hidden="true"><span />
      <div>{ticks.map(value => <span key={value} style={{ left: `${position(value)}%` }}>{formatNumber(value, '배')}</span>)}</div><span />
    </div>
    {rows.map(row => {
      const end = row.value != null && row.value > 0 ? position(row.value) : null;
      return <div className="ratio-row" key={row.id}>
        <span>{row.label}</span><span className="ratio-track" aria-hidden="true">
          {row.value === 0 && <span className="ratio-zero" title="관측값이 0인 항목" />}
          {end != null && <i className={row.highlight ? 'highlight' : ''}
            style={{ left: `${Math.min(end, 50)}%`, width: `${Math.abs(end - 50)}%` }} />}
        </span><strong>{formatNumber(row.value, '배')}</strong>
      </div>;
    })}
  </div>;
}
