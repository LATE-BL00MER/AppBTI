import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { request, useData } from '../api/client';
import type { Profile } from '../api/types';
import { ErrorNotice, formatNumber, monthLabel, Source } from '../components/Common';
import { useApp } from '../state';

export default function Intro() {
  const { meta, draft, setAnswers } = useApp();
  const navigate = useNavigate();
  const [selectedAge, setSelectedAge] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, error: previewError, reload } = useData<{ profiles: Profile[] }>('/profiles', draft.dataset);
  if (!meta) return null;
  const sampleAge = meta.ageGroups.find(age => age.id === selectedAge) || meta.ageGroups[2] || meta.ageGroups[0];
  const month = meta.months.at(-1)!;
  const maxDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  // 분야별 첫 중분류를 보여준다. 서로 다른 중분류의 값은 합산하지 않는다.
  const preview = meta.majorCategories.flatMap(major => meta.minorCategories.filter(minor => minor.major === major).slice(0, 1));
  const demo = async () => {
    if (!sampleAge) return;
    setBusy(true); setError(null);
    try {
      const rows = data || await request<{ profiles: Profile[] }>('/profiles', draft.dataset);
      const answers = meta.minorCategories.map(minor => {
        const row = rows.profiles.find(r => r.ageGroup === sampleAge.id && r.minorCode === minor.code);
        // 예시 응답도 실제 설문의 대표 일수 중 하나로 구성한다.
        const bins = [2, 7, 15, 24, maxDays];
        const days = row?.avgDays === undefined || row.avgDays === null ? null : bins.reduce((best, candidate) => Math.abs(candidate - row.avgDays!) < Math.abs(best - row.avgDays!) ? candidate : best);
        return { minorCode: minor.code, days, minutes: meta.metrics.timeComparable ? row?.avgDailyTime ?? null : null };
      });
      setAnswers(answers, true); navigate('/result');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '예시 결과를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  };
  return <div className="home-page">
    <section className="container home-intro" aria-labelledby="intro-title">
      <div className="home-title"><h1 id="intro-title">나의 한 달,<br />어떤 패턴일까?</h1><p>매일의 디지털 습관을 돌아보고,<br className="desktop-break" /> 응답 패턴과 닮은 집단의 통계를 만나보세요.</p></div>
      <div className="home-start"><Link to={meta.comparisonEnabled ? '/survey' : '/explore'} className="button primary large">{meta.comparisonEnabled ? '내 패턴 알아보기' : '세대별 탐색하기'} <span aria-hidden="true">↗</span></Link><p>{meta.comparisonEnabled ? `${meta.minorCategories.length}개 문항 · 로그인 없이 참여` : '현재는 집단별 통계를 살펴볼 수 있어요.'}</p></div>
    </section>

    <section className="container pattern-workspace" aria-labelledby="pattern-title">
      <div className="pattern-context"><div><h2 id="pattern-title">같은 하루, 다른 사용 습관.</h2><p>집단을 바꾸며 어떤 활동을 얼마나 자주 이용하는지 살펴보세요.</p></div><span className="snapshot-period">{monthLabel(month)}{meta.isMock ? ' · 예시' : ''}</span></div>
      <div className="pattern-layout">
        <div className="pattern-selector"><p>비교해 볼 집단</p><div className="group-picker" role="group" aria-label="미리 볼 집단">{meta.ageGroups.map(age => <button key={age.id} aria-pressed={sampleAge?.id === age.id} onClick={() => setSelectedAge(age.id)}>{age.label}<span aria-hidden="true">↗</span></button>)}</div><p className="pattern-caption">{meta.isMock ? 'A~F는 시연용 가상 집단입니다.' : '제공처 기준 연령 구간입니다.'}</p><Link className="text-link" to="/explore">모든 중분류 살펴보기 ↗</Link></div>
        <div className="pattern-data" aria-busy={!data && !previewError}>
          <div className="pattern-chart-title"><h3>{sampleAge?.label || '집단'}의 월평균 이용일수</h3><span>단위: 일 / 월</span></div>
          {previewError ? <ErrorNotice message={previewError} retry={reload} /> : <><div className="pattern-rows">{preview.map(minor => {
            const value = data?.profiles.find(row => row.ageGroup === sampleAge?.id && row.minorCode === minor.code)?.avgDays;
            return <div className="pattern-row" key={minor.code}><Link to={`/explore?minor=${encodeURIComponent(minor.code)}`}><span>{minor.major}</span>{minor.name}</Link><div className="pattern-track" aria-hidden="true">{value !== undefined && value !== null && <i style={{ width: `${value / maxDays * 100}%` }} />}</div><strong>{!data ? '불러오는 중' : formatNumber(value ?? null, '일')}</strong></div>;
          })}</div><div className="pattern-scale" aria-hidden="true"><span>0일</span><span>{maxDays}일</span></div><Source month={month} /></>}
        </div>
      </div>
      <div className="pattern-bottom"><p>나의 응답은 어떤 집단과 닮았을까요?</p>{meta.comparisonEnabled && <button className="text-link" disabled={busy || !sampleAge} onClick={demo}>{busy ? '결과 준비 중…' : '예시 응답으로 결과 체험하기 ↗'}</button>}{error && <p className="inline-error" role="alert">{error}</p>}</div>
    </section>

    <section className="container home-guide" aria-labelledby="guide-title"><div><h2 id="guide-title">결과보다, <br />그 이유까지.</h2><p>실제 나이를 추정하거나 개인의 이용 기록을 분석하지 않습니다. 내가 답한 습관과 집단 통계의 유사성을 비교합니다.</p><Link to="/data" className="text-link">데이터와 비교 기준 알아보기 ↗</Link></div><ol className="journey-list"><li><h3>한 달의 습관을 떠올려요.</h3><p>활동마다 이용한 일수에 가장 가까운 구간을 선택합니다.</p></li><li><h3>닮은 점과 다른 점을 확인해요.</h3><p>응답 일수와 집단 평균을 나란히 보며 비교 근거를 읽습니다.</p></li><li><h3>다른 집단의 패턴도 살펴봐요.</h3><p>분야별 이용일수, 이용자 연령 구성비, 월별 변화를 탐색합니다.</p></li></ol></section>
    <section className="container scope-summary" aria-label="데이터 범위"><p>{meta.months[0]} — {month}</p><p>전국 · {meta.ageGroups.length}개 집단 · {meta.majorCategories.length}개 분야</p><Link to="/data">출처와 범위 확인 ↗</Link></section>
  </div>;
}
