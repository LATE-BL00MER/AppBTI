import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../api/client';
import { formatNumber } from '../api/numbers';
import { insightSections, matchesInsights, standoutAge, type InsightsDocument } from '../api/insights';
import { ErrorNotice, Loading, monthLabel, Source } from '../components/Common';
import AgeStandout, { standoutSentence } from '../components/AgeStandout';
import { ageMapSentence } from '../components/PatternMap';
import { useApp } from '../state';
import './insights.css';

const InsightView = lazy(() => import('../components/InsightView'));

export default function Intro() {
  const { meta, draft } = useApp();
  const { data, error, reload } = useData<InsightsDocument>('/insights', draft.dataset);
  const available = data && meta && matchesInsights(data, meta);

  return <div className="home-page">
    <section className="container home-intro" aria-labelledby="intro-title">
      <div className="home-title">
        <h1 id="intro-title">앱·웹 이용 습관은<br /><span>연령대마다 어떻게 다를까요?</span></h1>
        {/* 서비스 가치를 한 문장으로: 데이터에서 찾은 연령대별 차이가 먼저이고, 설문은 선택으로 덧붙인다. */}
        <p className="home-value">{meta?.isMock ? '가상 연령대별 앱·웹 이용 집계' : 'LG U+ 연령대별 앱·웹 이용 집계'}에서 연령대마다 두드러지는 서비스를 찾아 보여드려요.
          {meta?.comparisonEnabled && ' 원하면 내 이용 습관이 그 사이 어디쯤인지도 견줘 볼 수 있어요.'}</p>
      </div>
      <div className="home-start"><Link className="button primary large" to="/insights">인사이트 리포트 읽기</Link>
        <Link className="button secondary large" to="/explore">분야별 탐색</Link></div>
    </section>

    {meta && <section className="container scope-summary" aria-label="데이터 범위">
      <p>{formatNumber(meta.ageGroups.length, '개')} 연령대</p><p>{formatNumber(meta.minorCategories.length, '개')} 카테고리</p>
      <Link to="/data">{monthLabel(meta.months[0])}–{monthLabel(meta.months.at(-1)!)} ↗</Link>
    </section>}

    <section className="container home-findings" aria-labelledby="key-insights">
      <h2 id="key-insights">데이터에서 발견한 세 가지</h2>
      {error ? <ErrorNotice message={error} retry={reload} /> : !data ? <Loading /> :
        !available ? <ErrorNotice message="새 기준에 맞는 분석 결과를 먼저 만들어 주세요." retry={reload} /> :
          <div className="insight-grid">{insightSections.map(({ id, title }) => id === 'common_signature' ? <AgeStandoutCard key={id} title={title} document={data} /> : <article className="insight-card" key={id}>
            <p className="context-label">{title}</p>
            <h3>{id === 'generation_map' ? (ageMapSentence(data.insights.generation_map.chart_data, data.age_groups,
              data.spotlights.generation_map?.age_group ?? data.insights.generation_map.chart_data.age_order[0]) ?? data.insights[id].headline) :
              data.spotlights[id]?.headline ?? (
              id === 'frequency_duration' ? data.insights[id].headline : '다른 발견과 겹치지 않는 사례가 없어요.')}</h3>
            <MajorServiceValues document={data} insight={id} />
            {id === 'frequency_duration' ?
              <p className="insight-caption home-finding-count">연령대별 이용 방식이 갈린 카테고리 {formatNumber(data.insights[id].chart_data.switching_count, '개')}</p> :
              <Suspense fallback={<Loading />}><InsightView id={id} document={data} /></Suspense>}
            <Link className="text-link insight-more" to={`/insights#${id}`}>자세히 보기 <span className="sr-only">· {title}</span>↗</Link>
          </article>)}</div>}
      <Source />
    </section>

    {meta?.comparisonEnabled && <section className="container home-cta">
      <h2>내 이용 습관과도 비교해 볼까요?</h2>
      <Link className="button secondary" to="/survey">선택 설문 시작하기</Link>
    </section>}
  </div>;
}

/**
 * 연령대별 탐색과 같은 기준(기타 분류 제외, 연령대 안 상대적 두드러짐 순)으로
 * 1위 배수가 가장 큰 연령대를 골라 그 연령대의 TOP 3를 보여 준다.
 */
function AgeStandoutCard({ title, document }: { title: string; document: InsightsDocument }) {
  const pick = standoutAge(document);
  return <article className="insight-card">
    <p className="context-label">{title}</p>
    {pick ? <>
      <h3>{standoutSentence(pick)}</h3>
      <AgeStandout document={document} pick={pick} />
      <Link className="text-link insight-more" to="/insights#common_signature">자세히 보기 <span className="sr-only">· {title}</span>↗</Link>
    </> : <h3>연령대별로 두드러지는 서비스가 없어요.</h3>}
  </article>;
}

function MajorServiceValues({ document, insight }: { document: InsightsDocument; insight: keyof InsightsDocument['insights'] }) {
  const focus = document.spotlights[insight];
  if (!focus?.minor_code) return null;
  const service = document.overview.services.find(item => item.minor_code === focus.minor_code);
  if (!service) return null;
  const days = service.days[focus.age_group];
  const time = service.minutes[focus.age_group];
  if (days == null && time == null) return null;
  const age = document.age_groups.find(item => item.id === focus.age_group);
  return <dl className="home-service-values">
    <div><dt>{service.minor_name} · {age?.label} · {monthLabel(document.overview.month)}</dt><dd>해당 서비스 이용자 기준</dd></div>
    <div><dt>월평균 이용일수</dt><dd>{formatNumber(days, '일')}</dd></div>
    <div><dt>일평균 이용시간</dt><dd>{formatNumber(time, '분')}</dd></div>
  </dl>;
}
