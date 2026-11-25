import { Fragment, useState } from 'react';
import { insightSections, type Age, type InsightsDocument, type Spotlight } from '../api/insights';
import { InsightTable } from './InsightTable';
import { formatNumber as pretty } from '../api/numbers';
import RatioBars from './RatioBars';
import PatternMap from './PatternMap';

type Report = InsightsDocument['insights'];
type Section = typeof insightSections[number]['id'];

// intro: 리포트에서 헤드라인 아래에 둘 설명. 헤드라인이 화면 안 선택을 따라 바뀌는 카드(공통 서비스)는 헤드라인·설명을 여기서 그린다.
// explanation: 연령대 지도처럼 고른 기준에 맞춰 문장이 바뀌는 카드에서 쓰는 설명.
export default function InsightView({ id, document, expanded = false, intro, explanation }: { id: Section; document: InsightsDocument; expanded?: boolean; intro?: string; explanation?: string }) {
  const { insights, age_groups: ages } = document;
  const focus = document.spotlights[id];
  if (!expanded && !focus) return null;
  // 연령대 지도: 고른 기준 연령대에 맞춰 문장과 막대가 함께 바뀐다(홈은 대표 연령대 기준).
  if (id === 'generation_map') return <PatternMap map={insights.generation_map.chart_data} ages={ages} compact={!expanded} focusAge={focus?.age_group}
    overall={expanded ? insights.generation_map.headline : undefined} explanation={expanded ? explanation : undefined} />;
  if (id === 'frequency_duration') return <FrequencyDuration data={insights.frequency_duration.chart_data} ages={ages} focus={focus} />;
  return <Signatures data={insights.common_signature.chart_data} ages={ages} expanded={expanded} focus={focus} intro={intro} />;
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
  const choices = data.switching ?? data.top_switching;
  const picked = choices.find(item => item.minor_code === code)
    ?? choices.find(item => item.minor_code === focus?.minor_code) ?? choices[0];
  const activeCode = picked?.minor_code;
  const points: FrequencyPoint[] = data.points.filter(point => point.minor_code === activeCode).map(point => ({
    ...point, name: ages.find(age => age.id === point.age_group)?.label ?? point.age_group,
  }));
  if (!picked || !points.length) return <p>두 지표에서 연령대별 이용 방식이 갈린 카테고리가 없어요.</p>;
  const inCell = (days: number, time: number) => points.filter(point => point.days_level === days && point.time_level === time);
  const summary = DAY_LEVELS.flatMap(days => TIME_LEVELS.map(time => [cellName(days, time), inCell(days, time)] as const))
    .filter(([, rows]) => rows.length).map(([name, rows]) => `${name}: ${rows.map(row => row.name).join(', ')}`).join('. ');

  return <>
    <div className="insight-selects">
      <label>카테고리 선택<select value={picked.minor_code} onChange={event => setCode(event.target.value)}>
        {choices.map(item => <option key={item.minor_code} value={item.minor_code}>{item.minor_name}</option>)}
      </select></label>
    </div>
    {choices.length < data.switching_count &&
      <p className="insight-caption">전체 카테고리 목록을 보려면 분석 결과를 다시 만들어 주세요.</p>}
    <p className="insight-caption">기준은 {picked.minor_name}의 여섯 연령대 평균이에요. 평균 대비 ±{pretty(data.band, 'ratio')} 안쪽은 평균 수준으로 봐요.</p>
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
            <div className="usage-chips">{rows.map(row => <span key={row.age_group} className="usage-chip">{row.name}</span>)}</div>
          </div>;
        })}
      </Fragment>)}
    </div>
    <InsightTable headings={['연령대', '월평균 이용일수', '일평균 이용시간', '판정', '비교 기간']}
      rows={points.map(point => [point.name, pretty(point.days, '일'), pretty(point.minutes, '분'), point.quadrant, pretty(point.common_months.length, '개월')])} />
  </>;
}

// 대표 서비스 헤드라인을 '두드러진다'고 말할 최소 배수. 파이프라인 insights.py의 VISIBLE_MULTIPLIER와 같다.
const VISIBLE_MULTIPLIER = 1.05;

function Signatures({ data, ages, expanded, focus, intro }: {
  data: Report['common_signature']['chart_data']; ages: Age[]; expanded: boolean; focus: Spotlight | null; intro?: string;
}) {
  const [chosen, setChosen] = useState('');
  const highest = Object.entries(data.signatures).filter(([, rows]) => rows.length)
    .sort(([, a], [, b]) => b[0].multiplier - a[0].multiplier)[0]?.[0] ?? ages[0]?.id;
  const active = chosen || focus?.age_group || highest;
  const all = data.signatures[active] ?? [];
  const representative = data.points.find(row => row.age_group === active && row.minor_code === focus?.minor_code);
  const rows = expanded ? all : representative ? [representative] : [];
  // 리포트 헤드라인은 고른 연령대의 1위 대표 서비스로 만든다. 문장 형식·기준 배수는 파이프라인(insights.py)과 같다.
  const top = all[0];
  const ageLabel = ages.find(age => age.id === active)?.label ?? active;
  const headline = !top ? `${ageLabel}에서 비교할 대표 서비스가 없어요.`
    : top.multiplier >= VISIBLE_MULTIPLIER ? `${ageLabel}의 ${top.minor_name} 이용은 다른 연령대보다 두드러져요(약 ${pretty(top.multiplier, '배')}).`
      : '대표 서비스는 연령대 평균과 비슷하게 나타났어요.';

  return <>
    {expanded && <><p className="insight-headline" aria-live="polite">{headline}</p>
      {intro && <p className="insight-caption">{intro}</p>}
      <AgeSelect ages={ages} value={active} onChange={setChosen} />
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
