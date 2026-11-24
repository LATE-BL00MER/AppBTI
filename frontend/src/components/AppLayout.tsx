import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../state';
import { ErrorNotice, Loading } from './Common';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { meta, error, reload, draft, changeDataset } = useApp();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => { window.scrollTo(0, 0); document.title = `${({ '/': '인사이트 요약', '/insights': '인사이트 리포트', '/explore/age': '연령대별 탐색', '/survey': '내 위치 찍어보기', '/result': '나의 패턴 리포트', '/explore': '분야별 탐색', '/patterns': '분야별 연령대 패턴', '/data': '데이터 안내' } as Record<string, string>)[pathname] || '페이지 안내'} | AppBTI`; }, [pathname]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">본문으로 바로가기</a>
      {meta?.isMock && <div className="demo-strip"><div><span className="demo-badge">예시 데이터</span><span>실제 LG U+ 통계와 무관한 가상 데이터로 체험하고 있어요.</span><Link to="/data">데이터 안내</Link></div></div>}
      <header className={`site-header ${menuOpen ? 'menu-open' : ''}`}><div className="header-inner">
        <Link to="/" className="wordmark" aria-label="AppBTI 홈"><svg width="28" height="29" viewBox="0 0 28 29" aria-hidden="true"><path d="M2 26V13h6v13M11 26V3h6v23M20 26V8h6v18" fill="currentColor" /></svg>AppBTI<span className="brand-dot">.</span></Link>
        <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '메뉴 닫기 −' : '메뉴 열기 +'}</button>
        <nav id="main-navigation" aria-label="주 메뉴" onClick={() => setMenuOpen(false)}>
          <NavLink to="/insights">인사이트 리포트</NavLink>
          <NavLink to="/explore/age">연령대별 탐색</NavLink>
          <NavLink to="/explore" end>분야별 탐색</NavLink>
          <NavLink to="/data">데이터 안내</NavLink>
          {meta?.comparisonEnabled && <NavLink to="/survey">내 위치 찍어보기</NavLink>}
        </nav>
      </div></header>
      <main id="main" tabIndex={-1}>{error ? <div className="container page"><ErrorNotice message={error} retry={reload} />{draft.dataset !== 'basic' && <button className="text-link" onClick={() => changeDataset('basic')}>기본 데이터로 돌아가기</button>}</div> : !meta ? <div className="container"><Loading /></div> : children}</main>
      <footer className="site-footer"><div className="container footer-inner"><div><Link className="footer-brand" to="/">AppBTI</Link><p>앱·웹 이용 데이터로 보는 연령대별 패턴</p></div><div><span>한성대학교 기업연계 SW캡스톤디자인 · U+TOPIA</span><p>연령대별 앱·웹 이용 인사이트</p><Link to="/data">데이터와 결과를 읽는 방법</Link></div></div></footer>
    </div>
  );
}
