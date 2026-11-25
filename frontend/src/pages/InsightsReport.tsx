import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useData } from '../api/client';
import { insightSections, matchesInsights, standoutAge, type InsightsDocument } from '../api/insights';
import { ErrorNotice, Loading, monthLabel, Source } from '../components/Common';
import { formatNumber } from '../api/numbers';
import InsightView from '../components/InsightView';
import AgeStandout, { standoutSentence } from '../components/AgeStandout';
import { useApp } from '../state';
import './insights.css';

const explanations = {
  generation_map: '막대가 짧을수록 두 연령대가 즐겨 쓰는 서비스의 구성이 비슷해요.',
  frequency_duration: '같은 서비스라도 자주 찾는 연령대와 오래 이용하는 연령대가 다를 수 있어요.',
  common_signature: '두드러지는 서비스와 여러 연령대에서 비슷하게 나타나는 서비스를 살펴봐요.',
};

export default function InsightsReport() {
  const { meta, draft } = useApp();
  const { hash } = useLocation();
  const { data, error, reload } = useData<InsightsDocument>('/insights', draft.dataset);
  const available = data && meta && matchesInsights(data, meta);
  useEffect(() => {
    if (!hash || !available) return;
    const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [hash, available]);

  return <div className="container insight-page insight-report">
    <header className="insight-hero">
      <h1>인사이트 리포트</h1>
      <p>같은 서비스를 어떤 연령대가 자주 찾고 오래 쓰는지, 월별 집계에서 그 근거를 비교했어요.</p>
    </header>
    <section id="data" className="insight-story">
      <h2>어떤 데이터를 봤나요?</h2>
      {meta && <p>{monthLabel(meta.months[0])}부터 {monthLabel(meta.months.at(-1)!)}까지 {formatNumber(meta.ageGroups.length, '개')} 연령대의 {formatNumber(meta.minorCategories.length, '개')} 카테고리를 살펴봤어요. 월별 이용자 수, 1인당 월평균 이용일수, 1인당 일평균 이용시간을 사용했어요.</p>}
      <Source />
    </section>
    <section id="method" className="insight-story">
      <h2>이용 패턴은 어떻게 비교했나요?</h2>
      <p>많이 쓰이는 서비스는 여러 연령대에서 함께 높게 나타날 수 있어요.</p>
      <p>그래서 각 연령대 안에서 어떤 서비스가 유독 두드러지는지 먼저 살펴봤어요.</p>
      <p>같은 서비스를 놓고 여섯 연령대의 두드러짐을 비교했어요.</p>
      <figure className="insight-method-figure" aria-label="전체 사용량의 영향을 줄이고 연령대별 이용 차이를 비교하는 순서">
        <span>월별 이용일수와 시간</span><span aria-hidden="true">→</span><span>연령대 안에서 두드러진 서비스</span><span aria-hidden="true">→</span><span>같은 서비스의 연령대 차이</span>
      </figure>
    </section>
    <section id="findings" className="insight-story">
      <h2>무엇을 발견했나요?</h2>
      {error ? <ErrorNotice message={error} retry={reload} /> : !data ? <Loading /> : !available ?
        <ErrorNotice message="현재 데이터 범위와 일치하는 분석 결과가 필요해요." retry={reload} /> :
        insightSections.map(({ id, title }) => id === 'common_signature' ? <AgeExploreBridge key={id} id={id} title={title} explanation={explanations[id]} document={data} /> : <article className="insight-card insight-report-card" id={id} key={id}>
          <h3>{title}</h3>
          {/* 연령대 지도는 고른 기준 연령대에 맞춰 문장이 바뀌므로 InsightView 안에서 그린다. */}
          {id !== 'generation_map' && <><p className="insight-headline">{data.insights[id].headline}</p>
            <p className="insight-caption">{explanations[id]}</p></>}
          <InsightView id={id} document={data} expanded explanation={id === 'generation_map' ? explanations[id] : undefined} />
          <details className="insight-table"><summary>어떻게 계산했나요?</summary><p>{data.insights[id].method_note}</p></details>
        </article>)}
    </section>
    <section id="limits" className="insight-story">
      <h2>집계로 어디까지 읽을 수 있나요?</h2>
      <h3 className="insight-limit-heading">선택 설문으로 보완하는 부분</h3>
      <ul>
        <li>집계는 연령대별 평균이라, 같은 연령대 안에서도 사람마다 습관이 얼마나 다른지는 보이지 않아요.
          선택 설문은 내 응답을 여섯 연령대의 패턴과 내 연령대 통계에 견줘, 평균 뒤에 가려진 개인 차이를 보여줘요.</li>
      </ul>
      <h3 className="insight-limit-heading">이번 데이터와 설문으로도 알 수 없는 부분</h3>
      <ul>
        <li>연령대 전체 인원 자료가 없어, 해당 연령대 전체 중 서비스 이용자가 얼마나 되는지는 알 수 없어요.</li>
        <li>서비스를 찾은 이유나 여러 서비스를 함께 쓰는 방식은 집계에도, 이용일수·시간을 묻는 설문에도 담기지 않아요.</li>
      </ul>
      <Link className="text-link" to="/data">데이터 범위와 비교 기준 보기 ↗</Link>
    </section>
    <section id="survey" className="insight-invite">
      <div><h2>내 습관도 연령대별 패턴과 비교해 보기</h2><p>연령대 평균에 가려진 개인 차이를 선택 설문으로 보완해요. 최근 7일 이용 습관을 답하면 어느 연령대 패턴과 가까운지, 내 연령대 통계와는 얼마나 다른지 볼 수 있어요.</p></div>
      {meta?.comparisonEnabled && <Link className="button secondary" to="/survey">선택 설문 시작하기</Link>}
    </section>
  </div>;
}

/**
 * 세 번째 발견: 처음엔 홈과 같은 연령대(40대)로 보여 주고, 연령대 버튼(20대 미만~60대 이상)으로 바꿔 볼 수 있다.
 * 자세한 비교는 연령대별 탐색으로 이어 준다.
 */
function AgeExploreBridge({ id, title, explanation, document }: { id: string; title: string; explanation: string; document: InsightsDocument }) {
  const [chosen, setChosen] = useState('');
  const initial = standoutAge(document);
  const ageId = chosen || initial?.age.id || document.age_groups[0]?.id || '';
  const picked = standoutAge(document, ageId);
  const pick = picked?.age.id === ageId ? picked : null;
  const label = document.age_groups.find(age => age.id === ageId)?.label ?? '';
  return <article className="insight-card insight-report-card insight-bridge" id={id}>
    <h3>{title}</h3>
    <div className="insight-age-picker" role="group" aria-label="연령대 고르기">
      {document.age_groups.map(age => <button key={age.id} type="button" aria-pressed={age.id === ageId}
        onClick={() => setChosen(age.id)}>{age.label}</button>)}
    </div>
    {pick ? <>
      <p className="insight-headline" aria-live="polite">{standoutSentence(pick)}</p>
      <p className="insight-caption">{explanation}</p>
      <AgeStandout document={document} pick={pick} />
    </> : <p className="insight-headline">{label}에서 다른 연령대보다 두드러지는 서비스가 없어요.</p>}
    <Link className="button primary" to={`/explore/age?age=${encodeURIComponent(ageId)}`}>{label} 연령대별 탐색으로 이어 보기 →</Link>
  </article>;
}
