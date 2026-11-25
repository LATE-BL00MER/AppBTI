import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../api/client';
import { matchesInsights, type InsightsDocument } from '../api/insights';
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
  const all = [...top, ...bottom];
  const majorRows = majors.filter(item => item.age_group === age).map(item => ({ id: item.major, label: item.major,
    value: includeOther ? item.all : item.regular, highlight: true })).filter(item => item.value != null);

  return <>
    <section className="insight-card insight-report-card">
      <h2>{label}에서 두드러지는 서비스 TOP 10 · 덜 두드러지는 서비스 TOP 10</h2>
      <RelativeUsageNote />
      <label><input type="checkbox" checked={includeOther} onChange={event => onToggle(event.target.checked)} /> 기타 분류 포함</label>
      {all.length ? <RatioBars label={`${label} 상대적 두드러짐`} rows={all.map(point => ({
        id: point.minor_code,
        label: <Link to={`/explore?minor=${encodeURIComponent(point.minor_code)}&age=${encodeURIComponent(age)}`}>{point.minor_name}</Link>,
        value: point.multiplier, highlight: true,
      }))} /> : <p>비교 가능한 서비스가 없어요.</p>}
    </section>
    <section className="insight-card insight-report-card"><h2>대분류별 요약</h2>
      <p>비교 가능한 서비스의 상대적 두드러짐을 분야별로 요약했어요.</p>
      {majorRows.length ? <RatioBars label="대분류별 상대적 두드러짐" rows={majorRows} /> : <p>요약할 값이 없어요.</p>}
    </section>
  </>;
}
