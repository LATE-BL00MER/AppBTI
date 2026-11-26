import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../api/client';
import { matchesInsights, type InsightsDocument } from '../api/insights';
import { formatNumber } from '../api/numbers';
import { ErrorNotice, Loading, Source } from '../components/Common';
import RatioBars from '../components/RatioBars';
import RelativeUsageNote from '../components/RelativeUsageNote';
import { useApp } from '../state';
import './insights.css';

export default function AgeExplore() {
  const { meta, draft } = useApp();
  const [params, setParams] = useSearchParams();
  const [includeOther, setIncludeOther] = useState(false);
  const { data, error, reload } = useData<InsightsDocument>('/insights', draft.dataset);
  if (!meta) return null;
  const selected = meta.ageGroups.find(age => age.id === params.get('age')) ?? meta.ageGroups[0];

  return <div className="container insight-page age-explore">
    <header className="page-heading"><div><h1>연령대별 탐색</h1><p>이 연령대에서는 어떤 서비스가 두드러질까요?</p></div></header>
    <div className="group-picker" role="group" aria-label="연령대">
      {meta.ageGroups.map(age => <button key={age.id} type="button" aria-pressed={age.id === selected?.id}
        onClick={() => setParams({ age: age.id })}>{age.label}</button>)}
    </div>
    {error ? <ErrorNotice message={error} retry={reload} /> : !data ? <Loading /> :
      !matchesInsights(data, meta) || !selected ? <p>현재 데이터에 맞는 분석 결과가 필요해요.</p> :
        <><AgeRanks data={data} age={selected.id} label={selected.label} includeOther={includeOther} onToggle={setIncludeOther} /><Source /></>}
  </div>;
}

function AgeRanks({ data, age, label, includeOther, onToggle }: {
  data: InsightsDocument; age: string; label: string; includeOther: boolean; onToggle: (include: boolean) => void;
}) {
  const { points, major_summary: majors } = data.insights.common_signature.chart_data;
  const rows = points.filter(point => point.age_group === age && (includeOther || !point.minor_name.includes('기타')))
    .sort((a, b) => b.multiplier - a.multiplier || a.minor_code.localeCompare(b.minor_code));
  const top = rows.filter(point => point.multiplier > 1).slice(0, 10);
  const bottom = [...rows].reverse().filter(point => point.multiplier < 1).slice(0, 10);
  // 두 목록이 같은 눈금을 쓰도록 1배에서 가장 먼 값(로그 기준)을 막대 최대 길이로 삼는다.
  const reach = Math.max(0, ...[...top, ...bottom].map(point => Math.abs(Math.log2(point.multiplier))));
  const majorRows = majors.filter(item => item.age_group === age).map(item => ({ id: item.major, label: item.major,
    value: includeOther ? item.all : item.regular, highlight: true })).filter(item => item.value != null);
  const link = (code: string) => `/explore?minor=${encodeURIComponent(code)}&age=${encodeURIComponent(age)}`;

  return <>
    <section className="insight-card insight-report-card">
      <h2>{label}에서 두드러지는 서비스</h2>
      <RelativeUsageNote />
      <label><input type="checkbox" checked={includeOther} onChange={event => onToggle(event.target.checked)} /> 기타 분류 포함</label>
      {/* key: 연령대·기타 포함을 바꿀 때마다 막대를 새로 그려 다시 차오르게 한다. */}
      {top.length || bottom.length ? <div className="rank-split" key={`${age}-${includeOther}`}>
        <RankList title="더 두드러지는 TOP 10" hint="여섯 연령대 평균보다 높은 순" tone="more" rows={top} reach={reach} link={link} />
        <RankList title="덜 두드러지는 TOP 10" hint="여섯 연령대 평균보다 낮은 순" tone="less" rows={bottom} reach={reach} link={link} />
      </div> : <p>비교 가능한 서비스가 없어요.</p>}
    </section>
    <section className="insight-card insight-report-card"><h2>대분류별 요약</h2>
      <p>비교 가능한 서비스의 상대적 두드러짐을 분야별로 요약했어요.</p>
      {majorRows.length ? <RatioBars key={`${age}-${includeOther}`} label="대분류별 상대적 두드러짐" rows={majorRows} /> : <p>요약할 값이 없어요.</p>}
    </section>
  </>;
}

type RankPoint = { minor_code: string; minor_name: string; multiplier: number };

// 한 방향 목록: 1배에서 한쪽으로만 막대를 그린다. 길이는 1배에서 떨어진 정도(로그)로, 두 목록이 같은 눈금을 쓴다.
function RankList({ title, hint, tone, rows, reach, link }: {
  title: string; hint: string; tone: 'more' | 'less'; rows: RankPoint[]; reach: number; link: (code: string) => string;
}) {
  return <div className={`rank-list ${tone}`}>
    <h3>{title}</h3>
    <p className="insight-caption">{hint}</p>
    {rows.length ? <ol aria-label={title}>{rows.map((point, index) => <li key={point.minor_code}>
      <span className="rank-no">{index + 1}</span>
      <Link to={link(point.minor_code)}>{point.minor_name}</Link>
      <span className="rank-track" aria-hidden="true">
        <i style={{ width: `${reach ? 100 * Math.abs(Math.log2(point.multiplier)) / reach : 0}%` }} />
      </span>
      <strong>{formatNumber(point.multiplier, '배')}</strong>
    </li>)}</ol> : <p>해당하는 서비스가 없어요.</p>}
  </div>;
}
