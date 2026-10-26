import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../state';
import { ErrorNotice, Loading } from './Common';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { meta, error, reload, draft, changeDataset } = useApp();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); document.title = `${({ '/': '디지털 습관으로 만나는 세대', '/survey': '내 패턴 알아보기', '/result': '나의 패턴 리포트', '/explore': '세대별 탐색', '/data': '데이터 안내' } as Record<string, string>)[pathname] || '페이지 안내'} | AppBTI`; }, [pathname]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">본문으로 바로가기</a>
      {meta?.isMock && <div className="demo-strip"><div><span className="demo-badge">예시 데이터</span><span>실제 LG U+ 통계와 무관한 가상 데이터로 체험하고 있어요.</span><Link to="/data">데이터 안내</Link></div></div>}
      <header className="site-header"><div className="header-inner">
        <Link to="/" className="wordmark" aria-label="AppBTI 홈"><svg width="28" height="29" viewBox="0 0 28 29" aria-hidden="true"><path d="M2 26V13h6v13M11 26V3h6v23M20 26V8h6v18" fill="currentColor" /></svg>AppBTI<span className="brand-dot">.</span></Link>
        <nav aria-label="주 메뉴"><NavLink to="/" end>서비스 소개</NavLink><NavLink to="/survey">내 패턴 알아보기</NavLink><NavLink to="/explore">세대별 탐색</NavLink><NavLink to="/data">데이터 안내</NavLink></nav>
      </div></header>
      <main id="main" tabIndex={-1}>{error ? <div className="container page"><ErrorNotice message={error} retry={reload} />{draft.dataset !== 'basic' && <button className="text-link" onClick={() => changeDataset('basic')}>기본 데이터로 돌아가기</button>}</div> : !meta ? <div className="container"><Loading /></div> : children}</main>
      <footer className="site-footer"><div className="container footer-inner"><div><Link className="footer-brand" to="/">AppBTI.</Link><p>나의 일상에서, 세대의 패턴을 발견하다.</p></div><div><span>한성대학교 기업연계 SW캡스톤디자인 · U+TOPIA</span><p>자기보고 응답과 집단 통계의 유사성 비교 서비스</p><Link to="/data">데이터와 결과를 읽는 방법</Link></div></div></footer>
    </div>
  );
}
