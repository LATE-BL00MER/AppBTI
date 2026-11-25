import type { ReactNode } from 'react';

export function TableViewport({ children, label = '표 내용' }: { children: ReactNode; label?: string }) {
  return <div className="stat-table-wrapper" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

// 이 길이를 넘는 값이 있는 열은 숫자 칸이 아니라 문장 칸으로 보고 왼쪽 정렬·줄바꿈한다.
const TEXT_CELL_LENGTH = 12;

export function InsightTable({ headings, rows, summary = '표로 보기' }: { headings: string[]; rows: string[][]; summary?: string }) {
  const textColumns = headings.map((_, column) => column > 0 && rows.some(row => (row[column]?.length ?? 0) > TEXT_CELL_LENGTH));
  const cellClass = (column: number) => textColumns[column] ? 'stat-text' : undefined;
  return <details className="insight-table">
    <summary>{summary}</summary>
    <TableViewport><table className="stat-table">
      <thead><tr>{headings.map((heading, column) => <th key={heading} scope="col" className={cellClass(column)}>{heading}</th>)}</tr></thead>
      <tbody>{rows.map(([first, ...cells], index) => <tr key={index}>
        <th scope="row">{first}</th>{cells.map((cell, i) => <td key={i} className={cellClass(i + 1)}>{cell}</td>)}
      </tr>)}</tbody>
    </table></TableViewport>
  </details>;
}
