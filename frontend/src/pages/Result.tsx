import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api/client';
import type { Evidence, SurveyResult } from '../api/types';
import { EmptyResult, ErrorNotice, formatNumber, Loading, monthLabel, Source } from '../components/Common';
import { useApp } from '../state';

function EvidenceList({ items, group }: { items: Evidence[]; group: string }) {
  return <div className="evidence-list">{items.map(item => <div className="evidence-row" key={item.minorCode}><div className="evidence-title"><div><span>{item.major}</span><Link to={`/explore?minor=${item.minorCode}`}>{item.name} <span aria-hidden="true">↗</span></Link></div><strong>{formatNumber(item.differenceDays, '일 차이')}</strong></div><div className="comparison-bars"><div><span>내 응답</span><div><i style={{ width: `${item.userDays / 31 * 100}%` }} /></div><strong>{formatNumber(item.userDays, '일')}</strong></div><div><span>{group}</span><div><i className="group-bar" style={{ width: `${item.groupDays / 31 * 100}%` }} /></div><strong>{formatNumber(item.groupDays, '일')}</strong></div></div>{item.userMinutes !== null && item.groupMinutes !== null && <p className="time-evidence">하루 평균 시간: 내 응답 {formatNumber(item.userMinutes, '분')} · {group} {formatNumber(item.groupMinutes, '분')}</p>}</div>)}</div>;
}

export default function Result() {
  const { meta, draft, setAnswers } = useApp();
  const [result, setResult] = useState<SurveyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [copied, setCopied] = useState('');
  const serialized = JSON.stringify(draft.answers);
  const month = meta?.months.at(-1);
  useEffect(() => {
    if (!month || !draft.answers.length) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    setResult(null); setError(null);
    request<SurveyResult>('/survey/result', draft.dataset, { method: 'POST', body: JSON.stringify({ month, answers: JSON.parse(serialized) }), signal: controller.signal })
      .then(value => { if (active) setResult(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : '계산이 지연되고 있습니다. 다시 시도해 주세요.'); })
      .finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [serialized, draft.dataset, month, retry]);
  if (!draft.answers.length) return <div className="container"><EmptyResult /></div>;
  if (error) return <div className="container page"><ErrorNotice message={error} retry={() => setRetry(key => key + 1)} /><Link to="/survey" className="text-link">응답 수정하기</Link></div>;
  if (!result || !meta) return <div className="container"><Loading /></div>;
  const restart = () => setAnswers([]);
  if (result.status === 'insufficient') return <div className="container page insufficient"><p className="eyebrow">나의 패턴 리포트</p><div className="insufficient-symbol" aria-hidden="true">…</div><h1>비교할 단서가<br />조금 더 필요해요.</h1><p>{result.reason}</p><div className="insufficient-count"><strong>{result.comparedCategories}<span> / {result.minimumCategories}개</span></strong><span>비교 가능한 항목 / 최소 필요 항목</span></div><p>응답하지 않은 활동이나 비공개 데이터는 비교에서 제외해요.<br />설문을 더 작성하거나, 집단별 통계를 먼저 둘러볼 수 있어요.</p><div className="button-row"><Link className="button primary" to="/survey">응답 이어서 작성하기</Link><Link className="button secondary" to="/explore">세대별 탐색하기</Link></div><Exclusions items={result.excluded} /><Source month={result.month} /></div>;
  const group = result.matches[0].label;
  const matchLabels = result.matches.map(g => g.label).join(' · ');
  const copy = async () => {
    const text = `AppBTI 패턴 리포트${draft.isExample ? ' (예시 응답)' : ''}\n응답 패턴이 ${matchLabels} 통계와 가장 비슷합니다.\n패턴 유사도 ${result.scores[0].score}점 · 공통 ${result.comparedCategories}개 항목\n닮은 항목: ${result.closest.map(e => e.name).join(', ')}\n${result.source}\n실제 연령 추정이나 개인 이용 기록 분석이 아닙니다.`;
    try { await navigator.clipboard.writeText(text); setCopied('리포트 요약을 복사했어요.'); }
    catch { setCopied('이 브라우저에서는 복사할 수 없어요. 화면의 내용을 선택해 복사해 주세요.'); }
  };
  return <div className="container result-page">
    <div className="page-topline"><p className="eyebrow">나의 패턴 리포트</p><span>{monthLabel(result.month)} 기준 · {result.comparedCategories}개 항목 비교</span></div>
    {draft.isExample && <div className="example-note"><strong>예시 응답으로 보는 결과입니다.</strong><span>직접 설문에 참여하면 나의 응답을 바탕으로 비교할 수 있어요.</span><Link to="/survey" onClick={restart}>직접 해보기 ↗</Link></div>}
    <section className="result-hero"><div><h1>나의 디지털 습관은<br /><span>{matchLabels}</span>과 가장 닮았어요.</h1><p>응답 패턴이 {matchLabels}의 통계와 가장 비슷합니다.<br />어떤 습관이 닮았는지, 아래 근거에서 확인해 보세요.</p>{result.matches.length > 1 && <p className="tie-note">공동 결과입니다. 아래 항목별 근거는 {group} 기준으로 표시합니다.</p>}<Source month={result.month} /></div><div className="similarity-number"><span>패턴 유사도</span><strong>{formatNumber(result.scores[0].score)}<small>점</small></strong><p>공통 항목의 차이를 0~100점으로 표현한 값<br />확률이나 정확도를 의미하지 않아요.</p></div></section>
    <section className="result-evidence"><div><div className="section-label"><span className="small-dot" /><h2>이런 습관이 닮았어요</h2><span>{result.closest.length}개 항목</span></div><EvidenceList items={result.closest} group={group} /></div><div><div className="section-label"><span className="small-dot muted" /><h2>{result.farthest.every(e => e.normalizedDistance === 0) ? '다른 항목도 같았어요' : '이런 습관은 달라요'}</h2><span>{result.farthest.length}개 항목</span></div><EvidenceList items={result.farthest} group={group} /></div></section>
    <Source month={result.month} />
    <section className="ranking-section"><div><p className="eyebrow">다른 집단과도 비교해 보면</p><h2>한 가지 결과 너머의<br />패턴도 살펴보세요.</h2><p>같은 항목과 같은 기준으로 모든 집단을 비교했어요.<br />응답이 달라지면 닮은 집단도 달라질 수 있습니다.</p><Link to="/explore" className="text-link">집단별 통계 자세히 보기 ↗</Link></div><div className="ranking-list">{result.scores.map(score => <div key={score.ageGroup} className={result.matches.some(g => g.id === score.ageGroup) ? 'best' : ''}><span>{score.label}</span><div><i style={{ width: `${score.score}%` }} /></div><strong>{formatNumber(score.score)}<small>점</small></strong></div>)}<Source month={result.month} /></div></section>
    <details className="method-note"><summary>결과는 어떻게 계산했나요?</summary><p>중분류별 집단 값의 최대·최소 차이로 응답과 통계 사이의 거리를 정규화하고, 항목 가중치를 적용했어요. 차이가 작을수록 높은 점수를 받습니다. 비교하지 못한 항목은 점수에 포함하지 않아요.</p><p>현재는 시연용 비교 방식입니다. 실제 데이터의 정의와 비교 방식은 수령 후 검증할 예정이에요. 시간은 설문과 집단의 정의가 같을 때만 함께 비교합니다.</p><Link className="text-link" to="/data">데이터 범위와 한계 확인하기</Link></details>
    <Exclusions items={result.excluded} />
    <div className="result-actions"><Link className="button primary" to="/survey">응답 수정하기</Link><button className="button secondary" onClick={copy}>리포트 요약 복사</button><Link className="text-link" to="/survey" onClick={restart}>처음부터 다시 하기</Link><span role="status">{copied}</span></div>
  </div>;
}

function Exclusions({ items }: { items: SurveyResult['excluded'] }) {
  if (!items.length) return null;
  return <details className="method-note"><summary>비교에서 제외한 {items.length}개 항목</summary><ul className="excluded-list">{items.map(item => <li key={item.minorCode}><strong>{item.name}</strong><span>{item.reason}</span></li>)}</ul></details>;
}
