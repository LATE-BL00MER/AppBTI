import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../api/client';
import type { Profile } from '../api/types';
import { ErrorNotice, formatNumber, Loading, monthLabel, Source } from '../components/Common';
import { useApp } from '../state';

type Metric = 'avgDays' | 'ageShare' | 'avgDailyTime';
// 한 계열의 색과 선 패턴을 함께 사용해 집단을 구분한다.
const colors = ['#1d5fbf', '#2d6d92', '#536f84', '#667783', '#505c68', '#303b46'];
const linePatterns = ['', '8 4', '2 4', '10 3 2 3', '16 6', '1 3 1 3 1 7'];

export default function Explore() {
  const { meta, draft } = useApp();
  const [params, setParams] = useSearchParams();
  const [selectedMonth, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [age, setAge] = useState('all');
  const [metric, setMetric] = useState<Metric>('avgDays');
  const minorCode = params.get('minor') || meta?.minorCategories[0]?.code || '';
  const month = selectedMonth || meta?.months.at(-1) || '';
  const { data: current, error, reload } = useData<{ profiles: Profile[] }>(`/profiles?month=${month}`, draft.dataset);
  const { data: trend, error: trendError, reload: reloadTrend } = useData<{ profiles: Profile[]; continuityBreaks: string[] }>(`/profiles/trend?minor=${encodeURIComponent(minorCode)}`, draft.dataset);
  if (!meta) return null;
  const minor = meta.minorCategories.find(c => c.code === minorCode);
  // 시간 데이터가 없는 버전으로 전환하면 일수 지표를 즉시 사용한다.
  const selectedMetric = metric === 'avgDailyTime' && !meta.metrics.dailyTime ? 'avgDays' : metric;
  const unit = selectedMetric === 'ageShare' ? '%' : selectedMetric === 'avgDailyTime' ? '분' : '일';
  const title = selectedMetric === 'ageShare' ? '이용자 연령 구성비' : selectedMetric === 'avgDailyTime' ? '일평균 이용시간' : '월평균 이용일수';
  const value = (row: Profile | undefined) => {
    if (!row || row[selectedMetric] === null) return null;
    return selectedMetric === 'ageShare' ? row.ageShare! * 100 : row[selectedMetric];
  };
  const bars = meta.ageGroups.map(a => ({ name: a.label, age: a.id, value: value(current?.profiles.find(r => r.minorCode === minorCode && r.ageGroup === a.id)) }));
  const segments = [...new Set(trend?.profiles.map(r => r.segment))];
  const series = meta.ageGroups.flatMap((a, index) => segments.map(segment => ({ key: `${a.id}_${segment}`, age: a.id, label: a.label, color: colors[index % colors.length], pattern: linePatterns[index % linePatterns.length] })));
  const lineData = meta.months.map(m => {
    const point: Record<string, string | number | null> = { month: `${Number(m.slice(5))}월` };
    series.forEach(s => { point[s.key] = value(trend?.profiles.find(r => r.month === m && r.ageGroup === s.age && `${r.ageGroup}_${r.segment}` === s.key)); });
    return point;
  });
  return <div className="container explore-page"><div className="page-heading"><div><h1>세대별 패턴 탐색</h1><p>궁금한 활동을 고르고, 집단별 패턴과 월별 변화를 비교해 보세요.</p></div><label className="select-label">기준월<select value={month} onChange={e => setMonth(e.target.value)}>{meta.months.map(m => <option value={m} key={m}>{monthLabel(m)}</option>)}</select></label></div>
    <label className="mobile-category">탐색할 중분류<select value={minor ? minorCode : ''} onChange={e => setParams({ minor: e.target.value })}>{!minor && <option value="" disabled>중분류를 선택해 주세요</option>}{meta.majorCategories.map(major => <optgroup key={major} label={major}>{meta.minorCategories.filter(c => c.major === major).map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</optgroup>)}</select></label>
    <div className="explore-layout"><aside className="category-sidebar"><label className="search-label"><span className="sr-only">중분류 찾기</span><input type="search" placeholder="중분류 찾기" value={search} onChange={e => setSearch(e.target.value)} /><span aria-hidden="true">⌕</span></label><nav aria-label="탐색할 중분류">{meta.majorCategories.map(major => { const items = meta.minorCategories.filter(c => c.major === major && c.name.includes(search)); return items.length ? <div className="category-group" key={major}><h2>{major}</h2>{items.map(c => <button key={c.code} className={minorCode === c.code ? 'active' : ''} aria-pressed={minorCode === c.code} onClick={() => setParams({ minor: c.code })}>{c.name}<span aria-hidden="true">{minorCode === c.code ? '↗' : '›'}</span></button>)}</div> : null; })}{!meta.minorCategories.some(c => c.name.includes(search)) && <p className="search-empty">검색 결과가 없어요.</p>}</nav></aside>
    <section className="explore-main">{!minor ? <div className="notice"><h2>해당 중분류를 찾을 수 없어요.</h2><button className="text-link" onClick={() => setParams({})}>첫 중분류 보기</button></div> : <><div className="explore-title"><div><span className="context-label">{minor.major}</span><h2>{minor.name}</h2><p>{minor.description}</p></div><span className="data-label">{meta.isMock ? '가상 집단 통계' : '집단 통계'}</span></div>
      <div className="metric-tabs" role="group" aria-label="비교 지표"><button className={selectedMetric === 'avgDays' ? 'active' : ''} aria-pressed={selectedMetric === 'avgDays'} onClick={() => setMetric('avgDays')}>이용일수</button><button className={selectedMetric === 'ageShare' ? 'active' : ''} aria-pressed={selectedMetric === 'ageShare'} onClick={() => setMetric('ageShare')}>이용자 연령 구성비</button>{meta.metrics.dailyTime && <button className={selectedMetric === 'avgDailyTime' ? 'active' : ''} aria-pressed={selectedMetric === 'avgDailyTime'} onClick={() => setMetric('avgDailyTime')}>일평균 이용시간</button>}</div>
      <div className="metric-explanation"><strong>{title}</strong><p>{selectedMetric === 'ageShare' ? '이 분류 이용자 중 각 집단이 차지하는 비중입니다. 집단별 가입자 규모의 영향을 받습니다.' : selectedMetric === 'avgDailyTime' ? '이용하는 날의 하루 평균 시간입니다. 다른 중분류의 시간과 합산하지 않습니다.' : '이 분류 이용자가 한 달 동안 이용한 평균 일수입니다. 개인 응답의 평균이 아닌 집단 통계입니다.'}</p></div>
      {error ? <ErrorNotice message={error} retry={reload} /> : !current ? <Loading /> : <><div className="chart-heading"><h3>{monthLabel(month)} 집단별 비교</h3><span>단위: {unit}</span></div><div className="chart-wrap" role="img" aria-label={`${minor.name} ${title}, 아래 표에서 모든 수치 확인 가능`}><ResponsiveContainer width="100%" height={265}><BarChart data={bars} margin={{ top: 15, right: 12, left: -25, bottom: 0 }} barSize={38}><CartesianGrid vertical={false} stroke="#e8e8e2" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#5c6470' }} /><YAxis ticks={selectedMetric === 'avgDays' ? [0, 10, 20, 30] : selectedMetric === 'ageShare' ? [0, 25, 50, 75, 100] : undefined} domain={selectedMetric === 'avgDays' ? [0, 31] : selectedMetric === 'ageShare' ? [0, 100] : [0, 'auto']} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} /><Tooltip formatter={v => formatNumber(typeof v === 'number' ? v : null, unit)} cursor={{ fill: '#f1f2ed' }} /><Bar dataKey="value" name={title} radius={[3, 3, 0, 0]} isAnimationActive={false}>{bars.map(item => <Cell key={item.age} fill={age === 'all' || age === item.age ? '#1d5fbf' : '#d1d7df'} />)}</Bar></BarChart></ResponsiveContainer></div><Source month={month} /><div className="stat-table-wrapper"><table className="stat-table"><caption className="sr-only">{minor.name} 집단별 {title}</caption><thead><tr><th scope="col">집단</th>{bars.map(b => <th scope="col" key={b.age}>{b.name}</th>)}</tr></thead><tbody><tr><th scope="row">{title}</th>{bars.map(b => <td key={b.age}>{formatNumber(b.value, unit)}</td>)}</tr></tbody></table></div>{bars.some(b => b.value === null) && <p className="missing-note">데이터 없음: 비공개·결측 또는 비교 집단 부족으로 계산하지 않은 값입니다. 0을 뜻하지 않아요.</p>}</>}
      <div className="trend-section"><div className="chart-heading"><h3>월별로 이어서 보면</h3><span>단위: {unit}</span></div><div className="age-filter" role="group" aria-label="추이를 강조할 집단"><button className={age === 'all' ? 'active' : ''} aria-pressed={age === 'all'} onClick={() => setAge('all')}>전체 집단</button>{meta.ageGroups.map((a, index) => <button className={age === a.id ? 'active' : ''} key={a.id} aria-pressed={age === a.id} onClick={() => setAge(a.id)}><svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true"><path d="M0 4H24" fill="none" stroke={colors[index % colors.length]} strokeWidth="2" strokeDasharray={linePatterns[index % linePatterns.length]} /></svg>{a.label}</button>)}</div>{trendError ? <ErrorNotice message={trendError} retry={reloadTrend} /> : !trend ? <Loading /> : <><div className="chart-wrap"><ResponsiveContainer width="100%" height={260}><LineChart data={lineData} margin={{ top: 12, right: 15, left: -25, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8e8e2" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} /><YAxis ticks={selectedMetric === 'avgDays' ? [0, 10, 20, 30] : selectedMetric === 'ageShare' ? [0, 25, 50, 75, 100] : undefined} domain={selectedMetric === 'avgDays' ? [0, 31] : selectedMetric === 'ageShare' ? [0, 100] : [0, 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} /><Tooltip formatter={(v, name) => [formatNumber(typeof v === 'number' ? v : null, unit), name]} />{series.map(s => <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeOpacity={age === 'all' || age === s.age ? 1 : 0.15} strokeWidth={age === s.age ? 3 : 2} strokeDasharray={s.pattern} dot={{ r: 2, strokeDasharray: 'none' }} connectNulls={false} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div><Source /><details className="method-note"><summary>월별 수치 표로 보기</summary><div className="stat-table-wrapper"><table className="stat-table"><thead><tr><th scope="col">월</th>{meta.ageGroups.map(a => <th key={a.id} scope="col">{a.label}</th>)}</tr></thead><tbody>{meta.months.map(m => <tr key={m}><th scope="row">{Number(m.slice(5))}월</th>{meta.ageGroups.map(a => <td key={a.id}>{formatNumber(value(trend.profiles.find(r => r.month === m && r.ageGroup === a.id)), unit)}</td>)}</tr>)}</tbody></table></div></details><p className="missing-note">값이 없거나 집계 기준이 바뀐 달은 선을 연결하지 않습니다.</p></>}</div>
    </>}</section></div></div>;
}
