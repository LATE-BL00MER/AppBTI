import { lazy, Suspense, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ageColor } from '../ageColors';
import { useData } from '../api/client';
import { formatNumber, ratioScale } from '../api/numbers';
import RatioBars from '../components/RatioBars';
import { ErrorNotice, Loading, monthLabel, Source, withJosa } from '../components/Common';
import CompositionIndexNote from '../components/CompositionIndexNote';
import RelativeUsageNote from '../components/RelativeUsageNote';
import { useApp } from '../state';
import AgeProfileAnalysis, { type GroupProfiles } from './AgeProfileAnalysis';
import './major-patterns.css';

const MonthlyAgeChart = lazy(() => import('./MonthlyAgeChart'));
const labels = {
  avgDays: { name: '자주 쓰는 서비스', metric: '이용일수의 상대적 두드러짐' },
  ageShare: { name: '이용자 구성', metric: '이용자 구성 지수' },
  avgDailyTime: { name: '오래 쓰는 서비스', metric: '이용시간의 상대적 두드러짐' },
} as const;
const references = {
  clrAgeMean: '여섯 연령대의 평균',
  compositionIndex: '기준 서비스 구성비',
};
type Metric = keyof typeof labels;
type Signal = { month: string; value: number; baseline: number; qualified: boolean };
type Service = {
  minorCode: string;
  values: Record<string, number>;
  rawShares?: Record<string, number>;
  points: { month: string; values: Record<string, number> }[];
  ages: Record<string, { gap: number; baseline: number; signals: Signal[]; matchedMonths: number }>;
};
type Analysis = {
  isMock: boolean; comparisonVersion: number; months: string[]; minimumMonths: number; categoryCount: number;
  evidenceThresholds: { above: number; below: number };
  representativeCodes: string[];
  /** 월별 이용자 수 상위 25% 서비스. 첫 화면과 분야 기본 선택에 먼저 쓴다(없으면 기존 기준). */
  majorCodes?: string[];
  compositionIndexReference?: { name: string };
  groupProfiles?: GroupProfiles | null;
  serviceEvidence?: { metric: Metric; reference: keyof typeof references; services: Service[] }[];
};
const fmt = (value: number, unit = '배') => formatNumber(value, unit);

export default function MajorPatterns() {
  const { meta, draft } = useApp();
  const { data, error, reload } = useData<Analysis>('/findings', draft.dataset);
  const [params, setParams] = useSearchParams();
  const headline = useRef<HTMLElement>(null);
  if (!meta) return null;
  const compatible = data && data.comparisonVersion === 3 && data.isMock === meta.isMock && data.categoryCount === meta.minorCategories.length
    && data.months.join(',') === meta.months.join(',');
  const representative = new Set(compatible ? data.representativeCodes : []);
  const major = new Set(compatible ? data.majorCodes ?? [] : []);
  const available = compatible ? (data.serviceEvidence ?? []).filter(block => block.services.some(item =>
    representative.has(item.minorCode) || item.minorCode === params.get('minor'))) : [];
  const analysis = available.find(block => block.metric === params.get('metric')) ?? available[0];
  const age = meta.ageGroups.find(group => group.id === params.get('age')) ?? meta.ageGroups[2] ?? meta.ageGroups[0];
  const ageId = age?.id ?? '';
  const minors = new Map(meta.minorCategories.map(item => [item.code, item]));
  const records = (analysis?.services ?? []).filter(item => item.ages[ageId] && minors.has(item.minorCode));
  const representativeRecords = records.filter(item => representative.has(item.minorCode));
  const linkedService = records.find(item => item.minorCode === params.get('minor'));
  const linkedMajor = minors.get(linkedService?.minorCode ?? '')?.major;
  const fields = meta.majorCategories.filter(major => major === linkedMajor ||
    representativeRecords.some(item => minors.get(item.minorCode)?.major === major));
  // 많이 쓰이는 서비스를 먼저, 그다음 여러 달 반복된 근거, 그다음 차이가 큰 순서로 고른다.
  const byEvidence = (a: Service, b: Service) => {
    const qualifyingA = a.ages[ageId].matchedMonths >= (data?.minimumMonths ?? 0);
    const qualifyingB = b.ages[ageId].matchedMonths >= (data?.minimumMonths ?? 0);
    return Number(major.has(b.minorCode)) - Number(major.has(a.minorCode))
      || Number(qualifyingB) - Number(qualifyingA)
      || Math.abs(b.ages[ageId].gap) - Math.abs(a.ages[ageId].gap);
  };
  const defaultService = [...representativeRecords].sort(byEvidence)[0];
  const field = fields.find(major => major === params.get('major'))
    ?? minors.get(linkedService?.minorCode ?? defaultService?.minorCode ?? '')?.major ?? '';
  const scoped = records.filter(item => minors.get(item.minorCode)?.major === field);
  const featured = scoped.filter(item => representative.has(item.minorCode)).sort(byEvidence);
  const selected = scoped.find(item => item.minorCode === params.get('minor')) ?? featured[0];
  const selectedStats = selected?.ages[ageId];
  const metric = analysis?.metric ?? 'avgDays';
  const metricLabel = labels[metric].metric;
  const isComposition = metric === 'ageShare';
  const baseline = analysis ? references[analysis.reference] : '';
  const ages = meta.ageGroups.map((group, index) => ({ ...group, color: ageColor(index) }));
  const nameOf = (service: Service) => minors.get(service.minorCode)?.name ?? service.minorCode;
  const preview = selected ? [selected, ...featured.filter(item => item !== selected)].slice(0, 4) : [];
  const dots = ratioScale(preview.flatMap(item => Object.values(item.values)));

  function update(next: Record<string, string>, returnToHeadline = false) {
    setParams(next, { replace: true, preventScrollReset: true });
    if (returnToHeadline) requestAnimationFrame(() => headline.current?.scrollIntoView({ block: 'start' }));
  }

  return <div className="container patterns-page">
    <header className="patterns-heading">
      <h1>분야별 연령대 패턴</h1>
      <p>연령대마다 어떤 서비스를 자주·오래 쓰는지 살펴보세요.{compatible && ` ${data.months.length}개월 집계의 이용일수, 이용자 구성, 이용시간을 비교했어요.`}</p>
    </header>
    {error && <ErrorNotice message={error} retry={reload} />}
    {!data && !error && <Loading />}
    {data && !compatible && <ErrorNotice message="현재 비교 방식으로 분석 결과를 다시 생성해 주세요." retry={reload} />}
    {compatible && !selected && <p>비교할 수 있는 서비스가 없어요.</p>}
    {compatible && analysis && age && selected && selectedStats && <>
      <div className="patterns-controls">
        <div className="patterns-control">
          <span id="patterns-age-label">어느 연령대를 볼까요?</span>
          <div className="patterns-age" role="group" aria-labelledby="patterns-age-label">
            {ages.map(group => <button key={group.id} type="button" aria-pressed={group.id === ageId}
              onClick={() => update({ age: group.id, metric })}>{group.label}</button>)}
          </div>
        </div>
        <div className="patterns-control">
          <span id="patterns-metric-label">어떤 점이 궁금하세요?</span>
          <div className="patterns-metrics" role="group" aria-labelledby="patterns-metric-label">
            {available.map(block => <button key={block.metric} type="button" aria-pressed={metric === block.metric}
              onClick={() => update({ age: ageId, metric: block.metric })}>{labels[block.metric].name}</button>)}
          </div>
        </div>
      </div>

      <section className="patterns-conclusion" ref={headline} aria-labelledby="patterns-conclusion-title">
        <div className="patterns-conclusion-top">
          <span>{data.months.length}개월 · {isComposition ? '월별 지수 요약' : '월별 비교 요약'}</span>
          <label>분야 <select value={field} onChange={event => update({ age: ageId, metric, major: event.target.value })}>
            {fields.map(major => <option key={major}>{major}</option>)}
          </select></label>
        </div>
        <h2 id="patterns-conclusion-title">{age.label}의 {nameOf(selected)} {withJosa(metricLabel, '는', '은')} <strong>{fmt(selected.values[ageId])}</strong>로 나타났어요.</h2>
        {isComposition && data.compositionIndexReference && <CompositionIndexNote reference={data.compositionIndexReference.name} />}
        {!isComposition && <RelativeUsageNote />}
        <MonthSignals key={`${metric}:${ageId}:${selected.minorCode}`} signals={selectedStats.signals}
          baseline={baseline} />
        <p className="patterns-rule">기간 요약과 같은 방향으로 {fmt(data.evidenceThresholds.above)}를 넘거나 {fmt(data.evidenceThresholds.below)} 미만인 달을 표시했어요. 이런 달이 {data.minimumMonths}개월 이상인 서비스를 먼저 보여줘요.</p>
        <p className="patterns-rule">{major.size > 0 ? '월별 이용자 수가 많은 상위 25% 서비스를 먼저 보여 줘요. 이용자가 적은 하위 20% 서비스는 대표 사례에서 뺐어요.' : '홈과 같은 기준으로, 월별 이용자 수 중앙값이 하위 20% 기준 이상인 서비스에서 대표 사례를 골랐어요.'}</p>
      </section>

      <section className="patterns-evidence" aria-labelledby="patterns-evidence-title">
        <h2 id="patterns-evidence-title">{metric === 'avgDailyTime' ? `${nameOf(selected)}의 월별 상대 이용시간` : isComposition ? `${monthLabel(data.months.at(-1)!)} 이용자 구성비` : `${field} 서비스의 연령대별 비교`}</h2>
        {metric === 'avgDailyTime' ? <div className="patterns-time-chart">
          <p><strong>{withJosa(age.label, '는', '은')}</strong> 초록색, 다른 연령대는 회색으로 표시했어요.</p>
          <Suspense fallback={<Loading />}><MonthlyAgeChart points={selected.points} ages={ages} selected={ageId} /></Suspense>
        </div> : <>
          <p>{isComposition ? '막대는 최근 달의 집계 구성비예요. 오른쪽 숫자는 선택 연령대의 기간 구성 지수예요.' : '점 하나가 연령대 하나예요. 초록색은 선택 연령대, 세로선은 1배 기준이에요.'}</p>
          {isComposition && <div className="patterns-chart-key">{ages.map(group => <span key={group.id}><i style={{ background: group.color }} />{group.label}</span>)}</div>}
          <div className="patterns-chart-rows">
            {preview.map(service => <div className="patterns-chart-row" key={service.minorCode}>
              <button className="text-link" type="button" onClick={() => update({ age: ageId, metric, major: field, minor: service.minorCode })}>{nameOf(service)}</button>
              <div className={isComposition ? 'patterns-share-track' : 'patterns-dot-track'} role="img"
                aria-label={ages.map(group => `${group.label} ${service.rawShares ? fmt(service.rawShares[group.id], 'ratio') : fmt(service.values[group.id])}`).join(', ')}>
                {!isComposition && <i className="patterns-dot-baseline" style={{ left: `${dots.position(1)}%` }} aria-hidden="true" />}
                {ages.map(group => <span key={group.id} className={group.id === ageId ? 'current' : undefined}
                  title={`${group.label} ${service.rawShares ? fmt(service.rawShares[group.id], 'ratio') : fmt(service.values[group.id])}`}
                  style={service.rawShares ? { flexGrow: service.rawShares[group.id], background: group.color } :
                    { left: `${dots.position(service.values[group.id])}%` }} />)}
              </div>
              <strong>{fmt(service.values[ageId])}</strong>
            </div>)}
          </div>
          <div className="patterns-chart-axis" aria-hidden="true">{isComposition ? <><span>0%</span><span>100%</span></> : <><span>{fmt(dots.ticks[0])}</span><span>1배</span><span>{fmt(dots.ticks.at(-1)!)}</span></>}</div>
        </>}
      </section>

      <section className="patterns-all-services" aria-labelledby="patterns-all-title">
        <h2 id="patterns-all-title">{field} 서비스 전체</h2>
        <p>가운데 선은 {baseline}의 1배예요. 서비스 이름을 누르면 위의 비교가 바뀌어요.</p>
        <RatioBars label={metricLabel} rows={[...scoped].sort((a, b) => b.ages[ageId].gap - a.ages[ageId].gap).map(service => ({
          id: service.minorCode, value: service.values[ageId], highlight: selected === service,
          label: <button type="button" className="text-link" aria-pressed={selected === service}
            onClick={() => update({ age: ageId, metric, major: field, minor: service.minorCode }, true)}>{nameOf(service)}</button>,
        }))} />
        <details className="patterns-method"><summary>어떻게 계산했나요?</summary>
          <p>이용일수는 달력 일수로 나눠 이용일 비율로 바꿨어요. 이 값과 분 단위 이용시간을 월·연령대별로 함께 CLR 변환했어요. 같은 월·서비스·지표의 연령대 평균을 뺀 뒤 지수화했어요.</p>
          <p>이용자 구성 지수는 같은 월·연령대의 서비스 구성비를 기준 서비스 구성비로 나눴어요. 결측으로 비교 기준을 맞출 수 없는 서비스는 배수에서 제외했어요.</p>
        </details>
        <Source />
      </section>
      {data.groupProfiles && <AgeProfileAnalysis profiles={data.groupProfiles} age={age} meta={meta} />}
      {meta.comparisonEnabled && <section className="patterns-invite" aria-labelledby="patterns-invite-title">
        <div><h2 id="patterns-invite-title">내 이용 습관도 비교할까요?</h2>
          <p>최근 7일의 이용 습관을 답하고, 어느 연령대의 패턴과 닮았는지 확인해 보세요.</p></div>
        <Link className="button secondary" to="/survey" state={{ patternSource: { path: `/patterns?${new URLSearchParams({
          age: ageId, metric, major: field, minor: selected.minorCode,
        })}` } }}>내 습관과 비교하기</Link>
      </section>}
    </>}
  </div>;
}

function MonthSignals({ signals, baseline }: { signals: Signal[]; baseline: string }) {
  const [index, setIndex] = useState(signals.length - 1);
  const signal = signals[index];
  return <div className="patterns-months">
    <strong>{signals.length}개월 중 {signals.filter(month => month.qualified).length}개월 반복</strong>
    <div className="patterns-month-dots" role="group" aria-label="월별 비교 근거">
      {signals.map((month, i) => <button type="button" aria-pressed={index === i} key={month.month}
        data-qualified={month.qualified} title={`${monthLabel(month.month)} · ${fmt(month.value)} / ${fmt(month.baseline)}`}
        onMouseEnter={() => setIndex(i)} onFocus={() => setIndex(i)} onClick={() => setIndex(i)}>
        <i aria-hidden="true" />{Number(month.month.slice(5))}월
      </button>)}
    </div>
    {signal && <p>{Number(signal.month.slice(5))}월 <b>{fmt(signal.value)}</b> · {baseline} {fmt(signal.baseline)}</p>}
  </div>;
}
