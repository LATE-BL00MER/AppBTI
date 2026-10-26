import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header>AppBTI <span>개발 준비 중</span></header>
      <main>{children}</main>
      <footer>한성대학교 기업연계 SW캡스톤디자인 · U+TOPIA</footer>
    </div>
  );
}
