import { useState } from 'react';
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import { insightSections, type Age, type InsightsDocument, type Spotlight } from '../api/insights';
import { InsightTable } from './InsightTable';
import { formatNumber as pretty, niceAxis } from '../api/numbers';
import RatioBars from './RatioBars';
import PatternMap from './PatternMap';
import AdjacentGaps from './AdjacentGaps';

type Report = InsightsDocument['insights'];
type Section = typeof insightSections[number]['id'];
// 자주·오래 산점도: 강조 연령대는 연령대 색 대신 브랜드 초록 하나로 고정한다.
// 가운데 연령대 색은 회색빛이라 다른 점과 구분되지 않았다. 나머지 점은 옅은 회색으로 낮춰 대비를 키운다.
const neutral = '#c3ccc7';
const highlight = '#006c48';

export default function InsightView({ id, document, expanded = false }: { id: Section; document: InsightsDocument; expanded?: boolean }) {
  const { insights, age_groups: ages } = document;
  const focus = document.spotlights[id];
  if (!expanded && !focus) return null;
  if (id === 'generation_map') {
    const map = insights.generation_map.chart_data;
    // 헤드라인은 이웃한 연령대 쌍을 비교하므로 그래프도 같은 기준을 먼저 보여 준다. 산출물에 쌍 정보가 없으면 예전 그래프를 쓴다.
    if (!map.adjacent?.length) return <PatternMap map={map} ages={ages} compact={!expanded} focusAge={focus?.age_group} />;
    return <>
      <AdjacentGaps map={map} ages={ages} />
      {expanded && <><h4 className="insight-subheading">연령대를 골라 가까운 순서 보기</h4>
        <PatternMap map={map} ages={ages} focusAge={focus?.age_group} /></>}
    </>;
  }
  if (id === 'frequency_duration') return <FrequencyDuration data={insights.frequency_duration.chart_data} ages={ages} focus={focus} />;
  return <Signatures data={insights.common_signature.chart_data} ages={ages} expanded={expanded} focus={focus} />;
}

function AgeSelect({ ages, value, onChange }: { ages: Age[]; value: string; onChange: (age: string) => void }) {
  return <label>강조할 연령대<select value={value} onChange={event => onChange(event.target.value)}>
    {ages.map(age => <option key={age.id} value={age.id}>{age.label}</option>)}
  </select></label>;
}

type FrequencyData = Report['frequency_duration']['chart_data'];
type FrequencyPoint = FrequencyData['points'][number] & { name: string };

function FrequencyDuration({ data, ages, focus }: { data: FrequencyData; ages: Age[]; focus: Spotlight | null }) {
  const [code, setCode] = useState('');
  const [age, setAge] = useState('');
  const choices = data.switching ?? data.top_switching;
  const picked = choices.find(item => item.minor_code === code)
    ?? choices.find(item => item.minor_code === focus?.minor_code) ?? choices[0];
  const activeCode = picked?.minor_code;
  const points = data.points.filter(point => point.minor_code === activeCode).map(point => ({
    ...point, name: ages.find(age => age.id === point.age_group)?.label ?? point.age_group,
  }));
  const thresholds = activeCode ? data.thresholds[activeCode] : null;
  if (!picked || !thresholds || !points.length) return <p>두 지표에서 연령대별 이용 방식이 갈린 카테고리가 없어요.</p>;
  const active = points.find(point => point.age_group === age)
    ?? (focus && picked.minor_code === focus.minor_code ? points.find(point => point.age_group === focus.age_group) : undefined)
    ?? points.find(point => point.days_level && point.time_level) ?? points[0];
  const activeAge = active.age_group;
  const others = points.filter(point => point.age_group !== activeAge);
  const xAxis = niceAxis([thresholds.days * (1 + data.band), ...points.map(point => point.days)], '일');
  const yAxis = niceAxis([thresholds.minutes * (1 + data.band), ...points.map(point => point.minutes)], '분');

  return <>
    <div className="insight-selects">
      <label>카테고리 선택<select value={picked.minor_code} onChange={event => setCode(event.target.value)}>
        {choices.map(item => <option key={item.minor_code} value={item.minor_code}>{item.minor_name}</option>)}
      </select></label>
      <AgeSelect ages={ages} value={activeAge} onChange={setAge} />
    </div>
    {choices.length < data.switching_count &&
      <p className="insight-caption">전체 카테고리 목록을 보려면 분석 결과를 다시 만들어 주세요.</p>}
    <p className="insight-caption">점선은 {picked.minor_name}의 여섯 연령대 평균이에요. 평균 대비 ±{pretty(data.band, 'ratio')} 안쪽은 평균 수준으로 봐요.</p>
    <p className="insight-caption" aria-live="polite"><strong>{picked.minor_name} · {active.name}</strong> · {active.quadrant}</p>
    <div className="insight-scatter" role="img" aria-label={`${picked.minor_name}의 연령대별 이용일수와 이용시간 산점도. 강조 연령대는 ${active.name}.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 88, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="2 6" />
          <XAxis type="number" dataKey="days" name="월평균 이용일수" {...xAxis} />
          <YAxis type="number" dataKey="minutes" name="일평균 이용시간" width={63} {...yAxis} />
          <ReferenceArea x1={thresholds.days * (1 - data.band)} x2={thresholds.days * (1 + data.band)} fill="#74968a" fillOpacity={0.13} />
          <ReferenceArea y1={thresholds.minutes * (1 - data.band)} y2={thresholds.minutes * (1 + data.band)} fill="#74968a" fillOpacity={0.13} />
          <ReferenceLine x={thresholds.days} stroke="#6c8076" strokeDasharray="5 3" />
          <ReferenceLine y={thresholds.minutes} stroke="#6c8076" strokeDasharray="5 3" />
          <Tooltip labelFormatter={(_, entries) => entries[0]?.payload?.name ?? ''}
            formatter={(value, name) => [pretty(typeof value === 'number' ? value : null, name === '월평균 이용일수' ? '일' : '분'), name]} />
          <Scatter data={others} fill={neutral} isAnimationActive={false} />
          {/* 강조 점은 마지막에 그려 다른 점 위에 오게 하고, 조금 크게·흰 테두리로 겹쳐도 보이게 한다. */}
          <Scatter data={[active]} isAnimationActive={false} shape={(props: unknown) => {
            const { cx, cy } = props as { cx?: number; cy?: number };
            return cx == null || cy == null ? <g /> : <circle cx={cx} cy={cy} r={7} fill={highlight} stroke="#fff" strokeWidth={2} />;
          }} />
          <FrequencyAgeLabels points={points} activeAge={activeAge} activeColor={highlight} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
    <InsightTable headings={['연령대', '월평균 이용일수', '일평균 이용시간', '판정', '비교 기간']}
      rows={points.map(point => [point.name, pretty(point.days, '일'), pretty(point.minutes, '분'), point.quadrant, pretty(point.common_months.length, '개월')])} />
  </>;
}

function FrequencyAgeLabels({ points, activeAge, activeColor }: { points: FrequencyPoint[]; activeAge: string; activeColor: string }) {
  const plot = usePlotArea();
  const scaleX = useXAxisScale();
  const scaleY = useYAxisScale();
  if (!plot || !scaleX || !scaleY) return null;
  const labels = points.flatMap(point => {
    const x = scaleX(point.days);
    const y = scaleY(point.minutes);
    return x == null || y == null ? [] : [{ ...point, x, y }];
  }).sort((first, second) => first.y - second.y);

  // 점이 붙어 있어도 연령대 글자가 겹치지 않도록 오른쪽 여백에 순서대로 배치한다.
  const spacing = 18;
  const right = plot.x + plot.width;
  let previousY = plot.y - spacing + 7;
  return <g className="insight-scatter-labels" aria-hidden="true">
    {labels.map(({ age_group, name, x, y }, index) => {
      const bottom = plot.y + plot.height - 7 - (labels.length - 1 - index) * spacing;
      const labelY = Math.min(Math.max(y, previousY + spacing), bottom);
      previousY = labelY;
      const active = age_group === activeAge;
      return <g key={age_group} className={active ? 'active' : undefined}>
        <path d={`M ${x + 5} ${y} H ${right + 1} L ${right + 9} ${labelY}`} stroke={active ? activeColor : neutral} />
        <text x={right + 13} y={labelY} dominantBaseline="central">{name}</text>
      </g>;
    })}
  </g>;
}

function Signatures({ data, ages, expanded, focus }: { data: Report['common_signature']['chart_data']; ages: Age[]; expanded: boolean; focus: Spotlight | null }) {
  const [chosen, setChosen] = useState('');
  const highest = Object.entries(data.signatures).filter(([, rows]) => rows.length)
    .sort(([, a], [, b]) => b[0].multiplier - a[0].multiplier)[0]?.[0] ?? ages[0]?.id;
  const active = chosen || focus?.age_group || highest;
  const all = data.signatures[active] ?? [];
  const representative = data.points.find(row => row.age_group === active && row.minor_code === focus?.minor_code);
  const rows = expanded ? all : representative ? [representative] : [];

  return <>
    {expanded && <><AgeSelect ages={ages} value={active} onChange={setChosen} />
      {!chosen && representative && !all.some(row => row.minor_code === representative.minor_code) &&
        <p className="insight-caption">홈에서 본 {representative.minor_name} · {pretty(representative.multiplier, '배')}</p>}
      <p className="insight-caption">상대적 두드러짐 · 가운데 1배는 같은 서비스의 여섯 연령대 평균을 뜻해요.</p></>}
    {rows.length === 0 ? <p>이 연령대의 대표 사례가 없어요.</p> : <>
      <RatioBars label="대표 서비스별 상대적 두드러짐" rows={rows.map(row =>
        ({ id: row.minor_code, label: row.minor_name, value: row.multiplier, highlight: true }))} />
      {expanded && <InsightTable headings={['대표 카테고리', '상대적 두드러짐', '이용일수', '이용시간']}
        rows={rows.map(row => [row.minor_name, pretty(row.multiplier, '배'), pretty(row.days_multiplier, '배'), pretty(row.time_multiplier, '배')])} />}
    </>}
    {expanded && data.common.length > 0 &&
      <p className="insight-caption">연령대 간 편차가 작은 공통 사례 · {data.common.map(item => item.minor_name).join(' · ')}</p>}
  </>;
}
