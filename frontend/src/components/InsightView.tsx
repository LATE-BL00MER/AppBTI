import { Fragment, useState } from 'react';
import { insightSections, type Age, type InsightsDocument, type Spotlight } from '../api/insights';
import { InsightTable } from './InsightTable';
import { formatNumber as pretty } from '../api/numbers';
import RatioBars from './RatioBars';
import PatternMap from './PatternMap';
import AdjacentGaps from './AdjacentGaps';

type Report = InsightsDocument['insights'];
type Section = typeof insightSections[number]['id'];

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

// 분류판 칸 순서. 세로는 이용일수(위가 자주), 가로는 이용시간(오른쪽이 오래). 값은 파이프라인의 days_level·time_level(-1·0·1)이다.
const DAY_LEVELS = [1, 0, -1] as const;
const TIME_LEVELS = [-1, 0, 1] as const;
const DAY_NAMES: Record<number, string> = { 1: '자주', 0: '일수 평균', [-1]: '가끔' };
const TIME_NAMES: Record<number, string> = { 1: '오래', 0: '시간 평균', [-1]: '짧게' };
const cellName = (days: number, time: number) => days === 0 && time === 0 ? '평균 수준' : `${DAY_NAMES[days]}·${TIME_NAMES[time]}`;

function FrequencyDuration({ data, ages, focus }: { data: FrequencyData; ages: Age[]; focus: Spotlight | null }) {
  const [code, setCode] = useState('');
  const [age, setAge] = useState('');
  const choices = data.switching ?? data.top_switching;
  const picked = choices.find(item => item.minor_code === code)
    ?? choices.find(item => item.minor_code === focus?.minor_code) ?? choices[0];
  const activeCode = picked?.minor_code;
  const points: FrequencyPoint[] = data.points.filter(point => point.minor_code === activeCode).map(point => ({
    ...point, name: ages.find(age => age.id === point.age_group)?.label ?? point.age_group,
  }));
  if (!picked || !points.length) return <p>두 지표에서 연령대별 이용 방식이 갈린 카테고리가 없어요.</p>;
  const active = points.find(point => point.age_group === age)
    ?? (focus && picked.minor_code === focus.minor_code ? points.find(point => point.age_group === focus.age_group) : undefined)
    ?? points.find(point => point.days_level && point.time_level) ?? points[0];
  const activeAge = active.age_group;
  const inCell = (days: number, time: number) => points.filter(point => point.days_level === days && point.time_level === time);
  const summary = DAY_LEVELS.flatMap(days => TIME_LEVELS.map(time => [cellName(days, time), inCell(days, time)] as const))
    .filter(([, rows]) => rows.length).map(([name, rows]) => `${name}: ${rows.map(row => row.name).join(', ')}`).join('. ');

  return <>
    <div className="insight-selects">
      <label>카테고리 선택<select value={picked.minor_code} onChange={event => setCode(event.target.value)}>
        {choices.map(item => <option key={item.minor_code} value={item.minor_code}>{item.minor_name}</option>)}
      </select></label>
      <AgeSelect ages={ages} value={activeAge} onChange={setAge} />
    </div>
    {choices.length < data.switching_count &&
      <p className="insight-caption">전체 카테고리 목록을 보려면 분석 결과를 다시 만들어 주세요.</p>}
    <p className="insight-caption">기준은 {picked.minor_name}의 여섯 연령대 평균이에요. 평균 대비 ±{pretty(data.band, 'ratio')} 안쪽은 평균 수준으로 봐요.</p>
    <p className="insight-caption" aria-live="polite"><strong>{picked.minor_name} · {active.name}</strong> · {active.quadrant}</p>
    {/* 산점도 대신 이용 방식 분류판: 연령대가 어느 칸(자주·오래, 가끔·짧게 …)에 속하는지 바로 읽히게 한다. */}
    <div className="usage-grid" role="group" aria-label={`${picked.minor_name} 연령대별 이용 방식. ${summary}`}>
      <span className="usage-axis usage-axis-corner" aria-hidden="true">일수 ↓ 시간 →</span>
      {TIME_LEVELS.map(time => <span key={time} className="usage-axis" aria-hidden="true">{time === 0 ? '평균' : TIME_NAMES[time]}</span>)}
      {DAY_LEVELS.map(days => <Fragment key={days}>
        <span className="usage-axis usage-axis-row" aria-hidden="true">{days === 0 ? '평균' : DAY_NAMES[days]}</span>
        {TIME_LEVELS.map(time => {
          const rows = inCell(days, time);
          const kind = days && time ? 'corner' : days || time ? 'edge' : 'center';
          return <div key={time} className={`usage-cell ${kind}${rows.length ? '' : ' empty'}`}>
            <span className="usage-cell-name">{cellName(days, time)}</span>
            <div className="usage-chips">{rows.map(row => <button key={row.age_group} type="button"
              className={row.age_group === activeAge ? 'usage-chip active' : 'usage-chip'}
              aria-pressed={row.age_group === activeAge} onClick={() => setAge(row.age_group)}>{row.name}</button>)}</div>
          </div>;
        })}
      </Fragment>)}
    </div>
    <InsightTable headings={['연령대', '월평균 이용일수', '일평균 이용시간', '판정', '비교 기간']}
      rows={points.map(point => [point.name, pretty(point.days, '일'), pretty(point.minutes, '분'), point.quadrant, pretty(point.common_months.length, '개월')])} />
  </>;
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
