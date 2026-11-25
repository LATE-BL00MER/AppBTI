import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../api/client';
import { formatNumber } from '../api/numbers';
import { insightSections, matchesInsights, standoutAge, type InsightsDocument } from '../api/insights';
import { CycleControls, useAutoCycle } from '../components/AutoCycle';
import { ErrorNotice, keepTogether, Loading, monthLabel, Source, withJosa } from '../components/Common';
import AgeStandout from '../components/AgeStandout';
import PatternMap from '../components/PatternMap';
import { useApp } from '../state';
import './insights.css';

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
          <div className="insight-grid">
            <AgeMapCard title={insightSections[0].title} document={data} />
            <UsageStyleCard title={insightSections[1].title} document={data} />
            <AgeStandoutCard title={insightSections[2].title} document={data} />
          </div>}
      <Source />
    </section>

    {meta?.comparisonEnabled && <section className="container home-cta">
      <h2>내 이용 습관과도 비교해 볼까요?</h2>
      <Link className="button secondary" to="/survey">선택 설문 시작하기</Link>
    </section>}
  </div>;
}

// 홈의 세 카드: 카드마다 예시가 몇 초 간격으로 바뀐다(AutoCycle). 카드 시작 시점을 어긋나게 해 한꺼번에 바뀌지 않게 한다.
// 세 카드는 같은 틀을 쓴다: 분류 이름 → 짧은 제목(2줄 높이 확보) → 설명(2줄 높이 확보) → 같은 높이의 그림 상자 → 넘김 버튼 → 자세히 보기.

function CardBody({ title, caption, children }: { title: ReactNode; caption: ReactNode; children: ReactNode }) {
  return <>
    <h3 className="home-card-title">{title}</h3>
    <p className="insight-caption home-card-caption">{caption}</p>
    <div className="home-card-visual">{children}</div>
  </>;
}

/**
 * 카드 전체를 누르면 리포트의 해당 절로 이어진다. 카드 위를 덮는 링크 하나를 두고(버튼을 링크 안에 넣지 않기 위해),
 * 넘김 버튼은 그 위에 올려 따로 눌리게 한다(.home-card-link, .cycle-controls의 z-index).
 */
function CardLink({ to, title }: { to: string; title: string }) {
  return <Link className="home-card-link" to={to}><span className="sr-only">{title} 리포트에서 자세히 보기</span></Link>;
}

const ageName = (document: InsightsDocument, id: string) => document.age_groups.find(item => item.id === id)?.label ?? id;

/** 홈 카드용 짧은 제목: 'OO는 OO와 가장 가깝고, OO와 가장 멀어요.' (리포트는 ageMapSentence의 긴 문장을 쓴다) */
function shortMapTitle(document: InsightsDocument, age: string) {
  const map = document.insights.generation_map.chart_data;
  if (!age || !map.distance_matrix || !map.age_order.includes(age)) return null;
  const row = map.distance_matrix[map.age_order.indexOf(age)];
  const ranks = map.age_order.flatMap((other, i) => other === age ? [] : [{ other, distance: row[i] }]).sort((a, b) => a.distance - b.distance);
  if (ranks.length < 2) return null;
  const closest = map.nearest.find(item => item.age_group === age)?.closest_age ?? ranks[0].other;
  const name = (id: string) => keepTogether(ageName(document, id));
  return `${withJosa(name(age), '는', '은')} ${withJosa(name(closest), '와', '과')} 가장 가깝고, ${withJosa(name(ranks.at(-1)!.other), '와', '과')} 가장 멀어요.`;
}

/** 연령대 지도: 기준 연령대를 하나씩 바꿔 가며 가장 가까운·먼 연령대를 보여 준다. 리포트 대표 연령대부터 시작한다. */
function AgeMapCard({ title, document }: { title: string; document: InsightsDocument }) {
  const map = document.insights.generation_map.chart_data;
  const first = document.spotlights.generation_map?.age_group;
  const order = first && map.age_order.includes(first) ? [first, ...map.age_order.filter(age => age !== first)] : map.age_order;
  const cycle = useAutoCycle(order.length);
  const age = order[cycle.index];
  return <article className="insight-card home-card" ref={cycle.ref} {...cycle.hold}>
    <p className="context-label">{title}</p>
    <div className="cycle-body home-card-body" key={age}>
      <CardBody title={shortMapTitle(document, age) ?? document.insights.generation_map.headline}
        caption={<>{keepTogether(ageName(document, age))} 기준이에요. 막대가 짧을수록 이용 패턴이 가까워요.</>}>
        <PatternMap map={map} ages={document.age_groups} compact hideCaption focusAge={age} />
      </CardBody>
    </div>
    <CycleControls name={title} labels={order.map(id => `${ageName(document, id)} 기준`)} {...cycle} />
    <CardLink to="/insights#generation_map" title={title} />
  </article>;
}

// 이용 방식 분류판(리포트)과 같은 칸 배치: 세로는 이용일수(위가 자주), 가로는 이용시간(오른쪽이 오래).
const DAY_ROWS = [1, 0, -1];
const TIME_COLUMNS = [-1, 0, 1];

/**
 * 자주 쓰기와 오래 쓰기: 이용 방식이 연령대마다 갈린 카테고리에서, 평균보다 자주·오래(또는 가끔·짧게 …) 쓰는
 * 연령대 사례를 하나씩 보여 준다. 리포트 대표 사례부터 시작하고 카테고리는 겹치지 않게 고른다.
 */
function UsageStyleCard({ title, document }: { title: string; document: InsightsDocument }) {
  const data = document.insights.frequency_duration.chart_data;
  const focus = document.spotlights.frequency_duration;
  const ageOrder = document.age_groups.map(age => age.id);
  const corners = data.points.filter(point => point.days_level && point.time_level && !point.minor_name.includes('기타'))
    .sort((a, b) => ageOrder.indexOf(a.age_group) - ageOrder.indexOf(b.age_group));
  const spotlight = corners.find(point => point.minor_code === focus?.minor_code && point.age_group === focus?.age_group);
  const cases = [spotlight, ...(data.switching ?? data.top_switching).map(service => corners.find(point => point.minor_code === service.minor_code))]
    .filter((point, i, all): point is NonNullable<typeof point> => !!point && all.findIndex(other => other?.minor_code === point.minor_code) === i)
    .slice(0, 5);
  const cycle = useAutoCycle(cases.length, { delay: 1100 });
  const pick = cases[cycle.index];
  return <article className="insight-card home-card" ref={cycle.ref} {...cycle.hold}>
    <p className="context-label">{title}</p>
    {pick ? <div className="cycle-body home-card-body" key={pick.minor_code}>
      <CardBody title={<>{withJosa(keepTogether(ageName(document, pick.age_group)), '는', '은')} {withJosa(pick.minor_name, '를', '을')}{' '}
        {pick.quadrant.replace('이 서비스 ', '').replace(/ 써요$/, '\u00A0써요')}.</>}
        caption={`${pick.minor_name}의 여섯 연령대 평균과 비교했어요.`}>
        <UsageStyle document={document} point={pick} />
        <p className="insight-caption usage-mini-note">연령대별 이용 방식이 갈린 카테고리 {formatNumber(data.switching_count, '개')}</p>
      </CardBody>
    </div> : <h3 className="home-card-title">{document.insights.frequency_duration.headline}</h3>}
    <CycleControls name={title} labels={cases.map(point => `${ageName(document, point.age_group)} ${point.minor_name}`)} {...cycle} />
    <CardLink to="/insights#frequency_duration" title={title} />
  </article>;
}

/** 연령대별로 두드러지는 서비스: 연령대를 하나씩 바꿔 가며 그 연령대의 TOP 3를 보여 준다. 대표 연령대(40대)부터 시작한다. */
function AgeStandoutCard({ title, document }: { title: string; document: InsightsDocument }) {
  const first = standoutAge(document);
  const picks = [first, ...document.age_groups.filter(age => age.id !== first?.age.id).map(age => standoutAge(document, age.id))]
    .filter((pick, i, all): pick is NonNullable<typeof pick> => !!pick && all.findIndex(other => other?.age.id === pick.age.id) === i);
  const cycle = useAutoCycle(picks.length, { delay: 2200 });
  const pick = picks[cycle.index];
  return <article className="insight-card home-card" ref={cycle.ref} {...cycle.hold}>
    <p className="context-label">{title}</p>
    {pick ? <div className="cycle-body home-card-body" key={pick.age.id}>
      <CardBody title={<>{withJosa(keepTogether(pick.age.label), '는', '은')} {withJosa(pick.rows[0].minor_name, '가', '이')} 가장 두드러져요.</>}
        caption={<>{keepTogether(pick.age.label)}에서 두드러지는 상위 3개예요. 가운데 1배는 여섯 연령대 평균이에요.</>}>
        <AgeStandout document={document} pick={pick} compact />
      </CardBody>
    </div> : <h3 className="home-card-title">연령대별로 두드러지는 서비스가 없어요.</h3>}
    <CycleControls name={title} labels={picks.map(item => item.age.label)} {...cycle} />
    <CardLink to="/insights#common_signature" title={title} />
  </article>;
}

type UsagePoint = InsightsDocument['insights']['frequency_duration']['chart_data']['points'][number];

/**
 * 사례가 분류판의 어느 칸인지 작은 3×3 칸으로 보여 주고, 옆에 실제 값을 적는다.
 * 값은 홈 요약 대상 서비스면 최근 달 값을, 그 밖의 서비스는 분류에 쓴 비교 기간 평균을 쓴다.
 */
function UsageStyle({ document, point }: { document: InsightsDocument; point: UsagePoint }) {
  const service = document.overview.services.find(item => item.minor_code === point.minor_code);
  const latest = service && (service.days[point.age_group] != null || service.minutes[point.age_group] != null);
  const days = latest ? service.days[point.age_group] : point.days;
  const time = latest ? service.minutes[point.age_group] : point.minutes;
  const period = latest ? monthLabel(document.overview.month) : `${formatNumber(point.common_months.length, '개월')} 평균`;
  return <div className="usage-mini">
    <div className="usage-mini-board" aria-hidden="true">
      <span className="usage-mini-y">자주</span>
      <div className="usage-mini-grid">{DAY_ROWS.flatMap(row => TIME_COLUMNS.map(column =>
        <i key={`${row}${column}`} className={row === point.days_level && column === point.time_level ? 'on' : undefined} />))}</div>
      <span className="usage-mini-y bottom">가끔</span>
      <span className="usage-mini-x"><span>짧게</span><span>오래</span></span>
    </div>
    <dl className="home-service-values">
      <div><dt>{period} · 이용자 기준</dt></div>
      <div><dt>월평균 이용일수</dt><dd>{formatNumber(days, '일')}</dd></div>
      <div><dt>일평균 이용시간</dt><dd>{formatNumber(time, '분')}</dd></div>
    </dl>
  </div>;
}
