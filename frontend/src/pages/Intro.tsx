import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { request, useData } from '../api/client';
import type { Profile } from '../api/types';
import { Source } from '../components/Common';
import { useApp } from '../state';

export default function Intro() {
  const { meta, draft, setAnswers } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = useData<{ profiles: Profile[] }>('/profiles', draft.dataset);
  if (!meta) return null;
  const sampleAge = meta.ageGroups[2];
  const preview = meta.minorCategories.filter((_, index) => index % 2 === 0).slice(0, 6);
  const demo = async () => {
    setBusy(true); setError(null);
    try {
      const rows = data || await request<{ profiles: Profile[] }>('/profiles', draft.dataset);
      const answers = meta.minorCategories.map(minor => {
        const row = rows.profiles.find(r => r.ageGroup === sampleAge.id && r.minorCode === minor.code);
        const maxDays = new Date(Number(meta.months.at(-1)!.slice(0, 4)), Number(meta.months.at(-1)!.slice(5)), 0).getDate();
        // 예시 사용자도 설문의 구간 선택지를 고른 것으로 구성한다.
        const bins = [2, 7, 15, 24, maxDays];
        const days = row?.avgDays === undefined || row.avgDays === null ? null : bins.reduce((best, candidate) => Math.abs(candidate - row.avgDays!) < Math.abs(best - row.avgDays!) ? candidate : best);
        return { minorCode: minor.code, days, minutes: meta.metrics.timeComparable ? row?.avgDailyTime ?? null : null };
      });
      setAnswers(answers, true); navigate('/result');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '예시 결과를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  return <>
    <section className="container hero" aria-labelledby="intro-title">
      <div className="hero-copy"><p className="eyebrow">나의 일상을 읽는 또 하나의 방법</p>
        <h1 id="intro-title">내 디지털 습관과<br /><span>닮은 세대 찾기.</span></h1>
        <p className="hero-description">영상을 보고, 음악을 듣고, 소식을 나누는 하루.<br />익숙한 습관을 따라 나와 닮은 이용패턴을 만나보세요.</p>
        <div className="hero-actions"><Link to={meta.comparisonEnabled ? '/survey' : '/explore'} className="button primary large">{meta.comparisonEnabled ? '내 패턴 알아보기' : '세대별 패턴 둘러보기'} <span aria-hidden="true">↗</span></Link>{meta.comparisonEnabled && <button className="text-link" disabled={busy} onClick={demo}>{busy ? '결과 준비 중…' : '예시 결과 먼저 보기'}</button>}</div>
        <p className="hero-note">{meta.comparisonEnabled ? `약 3분 · ${meta.minorCategories.length}개 문항 · 로그인 없이` : '비교 설정을 준비하는 동안 집단별 통계를 살펴보세요.'}</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
      <div className="hero-report"><div className="report-heading"><span>일상 패턴 관찰 노트</span><span>AppBTI</span></div>
        <div className="report-title"><span>서로 다른 습관이<br />하나의 패턴으로.</span><span className="report-monogram" aria-hidden="true">a<span>b</span></span></div>
        <div className="report-chart" aria-label={`${sampleAge.label} 예시 월평균 이용일수`}>
          {preview.map(minor => {
            const value = data?.profiles.find(r => r.ageGroup === sampleAge.id && r.minorCode === minor.code)?.avgDays;
            return <div className="report-row" key={minor.code}><span>{minor.name}</span><div className="dot-track" aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <i key={i} className={value !== undefined && value !== null && i < value / 2 ? 'filled' : ''} />)}</div><strong>{value === undefined || value === null ? '·' : `${value}일`}</strong></div>;
          })}
        </div><div className="report-foot"><span>{sampleAge.label} · {meta.months.at(-1)} 예시</span><span>월평균 이용일수</span></div><Source />
      </div>
    </section>
    <div className="scope-band"><div className="container scope-inner"><p>개인의 기록 대신,<br /><strong>집단의 패턴을 살펴봅니다.</strong></p><div><strong>{meta.months[0].replace('-', '.')}–{meta.months.at(-1)!.slice(5)}</strong><span>살펴보는 기간</span></div><div><strong>{meta.ageGroups.length}개 집단</strong><span>{meta.isMock ? '가상 A~F 구간' : '제공처 기준 연령 구간'}</span></div><div><strong>{meta.majorCategories.length}개 분야</strong><span>일상 속 디지털 활동</span></div></div></div>
    <section className="container editorial-section"><div><p className="eyebrow">결과를 이해하는 방법</p><h2>어떤 집단인지보다,<br />왜 닮았는지가 중요하니까.</h2><p className="section-description">AppBTI는 응답과 집단의 통계가 만나는 지점을 보여줍니다. 실제 나이와 개인의 이용 기록을 분석하지 않습니다.</p><Link to="/explore" className="text-link">설문 없이 세대별 패턴 둘러보기 ↗</Link></div><div className="feature-list"><div><span className="feature-symbol" aria-hidden="true">≋</span><div><h3>한 달의 습관을 돌아보고</h3><p>분야마다 얼마나 자주 이용하는지 알려주세요.<br />이용하지 않는 활동은 ‘사용 안 함’을 선택해요.</p></div></div><div><span className="feature-symbol" aria-hidden="true">≈</span><div><h3>비슷한 패턴과 그 근거를 발견하고</h3><p>닮은 항목과 차이가 있는 항목을 함께 비교해요.<br />응답 일수와 집단 평균을 나란히 볼 수 있어요.</p></div></div><div><span className="feature-symbol" aria-hidden="true">↗</span><div><h3>다른 집단의 일상까지 넓혀보고</h3><p>집단별 이용일수, 이용자 연령 구성비와<br />월별 변화를 직접 살펴보세요.</p></div></div></div></section>
    <section className="container bottom-invitation"><p>같은 앱을 쓰는 우리,<br /><strong>사용하는 방식도 닮았을까요?</strong></p><Link to="/survey" className="button primary">나의 습관으로 시작하기</Link></section>
  </>;
}
