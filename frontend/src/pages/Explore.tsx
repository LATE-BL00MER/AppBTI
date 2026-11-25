import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../api/client';
import { matchesInsights, type InsightsDocument } from '../api/insights';
import { formatNumber, niceAxis } from '../api/numbers';
import type { Profile } from '../api/types';
import { ErrorNotice, Loading, monthLabel, Source } from '../components/Common';
import { InsightTable } from '../components/InsightTable';
import RatioBars from '../components/RatioBars';
import RelativeUsageNote from '../components/RelativeUsageNote';
import { ageColor } from '../ageColors';
import { useApp } from '../state';
import './insights.css';

const metrics = {
  avgDays: { tab: '이용일수', title: '월평균 이용일수', unit: '일' },
  avgDailyTime: { tab: '이용시간', title: '일평균 이용시간', unit: '분' },
  ageShare: { tab: '이용자 구성비', title: '이용자 구성비', unit: '%' },
} as const;
type Metric = keyof typeof metrics;
const byName = (a: string, b: string) => a.localeCompare(b, 'ko');
const preferred = ['portal', 'ott', 'weather', 'learn'];

export default function Explore() {
  const { meta, draft } = useApp();
  const [params, setParams] = useSearchParams();
  const [monthChoice, setMonth] = useState('');
  const [major, setMajor] = useState('');
  const [search, setSearch] = useState('');
  const [age, setAge] = useState(params.get('age') ?? '');
  const startMetric = params.get('metric');
  const [metricChoice, setMetric] = useState<Metric>(startMetric === 'ageShare' || startMetric === 'avgDailyTime' ? startMetric : 'avgDays');
  const month = monthChoice || meta?.months.at(-1) || '';
  const query = search.trim().toLocaleLowerCase('ko');
  const catalog = meta?.minorCategories ?? [];
  const majors = [...(meta?.majorCategories ?? [])].sort(byName);
  const filtered = catalog.filter(item => (!major || item.major === major) && item.name.toLocaleLowerCase('ko').includes(query))
    .sort((a, b) => byName(a.major, b.major) || byName(a.name, b.name) || a.code.localeCompare(b.code));
  const requested = params.get('minor');
  const minor = filtered.find(item => item.code === requested)
    ?? preferred.map(code => filtered.find(item => item.code === code)).find(Boolean)
    ?? filtered.find(item => !item.name.includes('기타'))
    ?? filtered[0];
  const code = minor?.code ?? catalog[0]?.code ?? '';
  const latest = useData<{ profiles: Profile[] }>(`/profiles?month=${month}`, draft.dataset);
  const trend = useData<{ profiles: Profile[] }>(`/profiles/trend?minor=${encodeURIComponent(code)}`, draft.dataset);
  const { data: insights } = useData<InsightsDocument>('/insights', draft.dataset);
  if (!meta) return null;

  const metric = metricChoice === 'avgDailyTime' && !meta.metrics.dailyTime ? 'avgDays' : metricChoice;
  const { title, unit } = metrics[metric];
  const chosenAge = meta.ageGroups.find(group => group.id === age)?.id ?? meta.ageGroups[0]?.id;
  const analysis = insights && matchesInsights(insights, meta) ? insights : null;
  const raw = (row?: Profile) => {
    const value = row?.[metric];
    return value == null ? null : metric === 'ageShare' ? value * 100 : value;
  };
  const current = latest.data?.profiles.filter(row => row.minorCode === code && row.month === month) ?? [];
  const bars = meta.ageGroups.map(group => ({ ...group, value: raw(current.find(row => row.ageGroup === group.id)) }));
  const trends = trend.data?.profiles.filter(row => row.minorCode === code) ?? [];
  const segments = [...new Set(trends.map(row => row.segment))];
  const series = meta.ageGroups.flatMap((group, index) => segments.map(segment => ({
    ...group, key: `${group.id}_${segment}`, segment, color: ageColor(index),
  })));
  const lineData = meta.months.map(value => ({
    month: monthLabel(value),
    ...Object.fromEntries(series.map(item => [item.key, raw(trends.find(row =>
      row.month === value && row.ageGroup === item.id && row.segment === item.segment))])),
  }));
  const multipliers = analysis?.insights.common_signature.chart_data.monthly_points ?? [];
  const ratioRows = meta.ageGroups.map(group => {
    const row = current.find(item => item.ageGroup === group.id);
    const point = multipliers.find(item => item.month === month && item.minor_code === code && item.age_group === group.id);
    const composition = analysis?.composition_index?.points.find(item => item.month === month && item.minor_code === code && item.age_group === group.id);
    const value = metric === 'avgDays' ? row?.ageRelativeDays ?? point?.days_multiplier
      : metric === 'avgDailyTime' ? row?.ageRelativeTime ?? point?.time_multiplier : composition?.index;
    return { id: group.id, label: group.label, value: value ?? null, highlight: group.id === chosenAge };
  });
  const frequencyRows = bars.map(group => ({ id: group.id, label: group.label,
    value: current.find(row => row.ageGroup === group.id)?.relativeFrequency ?? null, highlight: group.id === chosenAge }));
  const chartAxis = (values: (number | null)[]) => niceAxis(metric === 'ageShare' ? [100] : values, unit);
  const tooltip = (value: unknown) => formatNumber(typeof value === 'number' ? value : null, unit);

  return <div className="container explore-page">
    <div className="page-heading"><div><h1>분야별 탐색</h1><p>서비스를 고르고 연령대별 이용 차이를 살펴보세요.</p></div>
      <label className="select-label">기준월<select value={month} onChange={event => setMonth(event.target.value)}>
        {meta.months.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}
      </select></label>
    </div>
    <section className="explore-pickers" aria-label="분야와 서비스 선택">
      <div className="group-picker" role="group" aria-label="대분류">
        <button type="button" aria-pressed={!major} onClick={() => setMajor('')}>전체</button>
        {majors.map(name => <button key={name} type="button" aria-pressed={major === name} onClick={() => setMajor(name)}>{name}</button>)}
      </div>
      <div className="insight-selects">
        <label>카테고리 검색<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>카테고리<select value={minor?.code ?? ''} disabled={!minor} onChange={event =>
          setParams(current => { const next = new URLSearchParams(current); next.set('minor', event.target.value); return next; })}>
          {!minor && <option value="">검색 결과 없음</option>}
          {majors.map(name => {
            const options = filtered.filter(item => item.major === name);
            return options.length > 0 && <optgroup key={name} label={name}>{options.map(item =>
              <option key={item.code} value={item.code}>{item.name}</option>)}</optgroup>;
          })}
        </select></label>
      </div>
    </section>
    {!minor ? <p>검색 조건에 맞는 서비스가 없어요.</p> : <section className="explore-main">
      <div className="explore-title"><div><span className="context-label">{minor.major}</span><h2>{minor.name}</h2><p>{minor.description}</p></div>
        <Link className="text-link" to={`/patterns?${new URLSearchParams({ major: minor.major, minor: minor.code, age: chosenAge ?? '' })}`}>{minor.major} 분야 연령대 패턴 더 보기 ↗</Link></div>
      <div className="metric-tabs" role="group" aria-label="비교 지표">
        {(Object.keys(metrics) as Metric[]).filter(key => key !== 'avgDailyTime' || meta.metrics.dailyTime).map(key =>
          <button key={key} type="button" className={metric === key ? 'active' : ''} aria-pressed={metric === key}
            onClick={() => setMetric(key)}>{metrics[key].tab}</button>)}
      </div>
      <div className="age-filter" role="group" aria-label="강조할 연령대">
        {meta.ageGroups.map(group => <button key={group.id} type="button" aria-pressed={group.id === chosenAge}
          className={group.id === chosenAge ? 'active' : ''} onClick={() => setAge(group.id)}>{group.label}</button>)}
      </div>
      {latest.error ? <ErrorNotice message={latest.error} retry={latest.reload} /> : !latest.data ? <Loading /> : <>
        <section className="month-comparison">
          <h3>{title} · {monthLabel(month)}</h3>
          <p>{metric === 'ageShare' ? '이 서비스를 이용한 사람 중 해당 연령대가 차지하는 비중이에요.' : '이 서비스를 이용한 사람 기준 평균이에요.'}</p>
          {/* 값은 막대 위에 직접 표시한다. 스크린리더는 aria-label로 같은 값을 읽는다. */}
          <div className="chart-wrap" role="img"
            aria-label={`${minor.name} ${title}: ${bars.map(row => `${row.label} ${formatNumber(row.value, unit)}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height={240}><BarChart data={bars} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e8e8e2" />
              {/* 표가 없으므로 좁은 화면에서도 연령대 이름을 하나도 건너뛰지 않는다. */}
              <XAxis dataKey="label" interval={0} tick={{ fontSize: 10 }} />
              <YAxis {...chartAxis(bars.map(row => row.value))} />
              <Tooltip formatter={tooltip} />
              <Bar dataKey="value" name={title} isAnimationActive={false}>{bars.map((row, index) =>
                <Cell key={row.id} fill={ageColor(index)} fillOpacity={row.id === chosenAge ? 1 : .35} />)}
                <LabelList dataKey="value" position="top" formatter={tooltip} fontSize={10.5} fill="#3d4a43" />
              </Bar>
            </BarChart></ResponsiveContainer>
          </div>
          <Source month={month} />
        </section>
        <section className="month-comparison">
          <h3>{metric === 'ageShare' ? '기준 서비스 대비 구성 지수' : '상대적 두드러짐'}</h3>
          {metric === 'ageShare' ? <p>같은 월·연령대에서 이 서비스의 구성비를 {analysis?.composition_index?.reference.name ?? '기준 서비스'}의 구성비와 견준 값이에요.</p> : <RelativeUsageNote />}
          {ratioRows.some(row => row.value != null) ? <RatioBars rows={ratioRows} label="연령대별 상대 비교" /> : <p>비교할 수 있는 값이 없어요.</p>}
          {metric === 'avgDays' && frequencyRows.some(row => row.value != null) && <details className="insight-table explore-extra">
            <summary>평균 대비 이용일수도 보기</summary>
            <p>이 서비스 이용자 전체의 평균 일수와 각 연령대의 일수를 비교했어요.</p>
            <RatioBars label="평균 대비 이용일수" rows={frequencyRows} />
          </details>}
        </section>
      </>}
      <section id="monthly-trend" className="trend-section">
        <h3>{title}의 월별 변화</h3>
        {trend.error ? <ErrorNotice message={trend.error} retry={trend.reload} /> : !trend.data ? <Loading /> : <>
          <div className="chart-wrap" role="img" aria-label={`${minor.name} ${title} 월별 변화`}>
            <ResponsiveContainer width="100%" height={250}><LineChart data={lineData}>
              <CartesianGrid vertical={false} stroke="#e8e8e2" />
              <XAxis dataKey="month" tickFormatter={(value: string) => value.split(' ').at(-1) ?? value} />
              <YAxis {...chartAxis(trends.map(row => raw(row)))} />
              <Tooltip formatter={tooltip} />
              {series.map(item => <Line key={item.key} dataKey={item.key} name={item.label} stroke={item.color}
                strokeWidth={item.id === chosenAge ? 3 : 1.5} strokeOpacity={item.id === chosenAge ? 1 : .35} connectNulls={false} isAnimationActive={false} />)}
            </LineChart></ResponsiveContainer>
          </div>
          <InsightTable headings={['월', ...meta.ageGroups.map(group => group.label)]} rows={meta.months.map(value => [
            monthLabel(value), ...meta.ageGroups.map(group => formatNumber(raw(trends.find(row => row.month === value && row.ageGroup === group.id)), unit)),
          ])} />
          <p className="missing-note">비공개 또는 집계가 없는 달은 데이터 없음으로 표시해요.</p>
        </>}
      </section>
    </section>}
  </div>;
}
