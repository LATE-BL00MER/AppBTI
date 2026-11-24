import type { ReactNode } from 'react';

export function TableViewport({ children, label = '표 내용' }: { children: ReactNode; label?: string }) {
  return <div className="stat-table-wrapper" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

export function InsightTable({ headings, rows, summary = '표로 보기' }: { headings: string[]; rows: string[][]; summary?: string }) {
  return <details className="insight-table">
    <summary>{summary}</summary>
    <TableViewport><table className={headings.length > 4 ? 'stat-table stat-table-wide' : 'stat-table'}>
      <thead><tr>{headings.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
      <tbody>{rows.map(([first, ...cells], index) => <tr key={index}>
        <th scope="row">{first}</th>{cells.map((cell, i) => <td key={i}>{cell}</td>)}
      </tr>)}</tbody>
    </table></TableViewport>
  </details>;
}
