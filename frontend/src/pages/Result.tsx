import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { request } from '../api/client';
import type { Evidence, SurveyRequest, SurveyResult } from '../api/types';
import { EmptyResult, ErrorNotice, Loading, monthLabel, withJosa } from '../components/Common';
import { useApp } from '../state';
import './result.css';

/**
 * 결과는 POST /survey/result 응답 하나로 그린다(docs/API.md 0장).
 * 설문에서 넘어오면 그 응답을 쓰고, 새로고침 등으로 없으면 이 탭의 응답으로 다시 요청한다.
 */
export default function Result() {
  const { draft } = useApp();
  const state = useLocation().state as { result?: SurveyResult; dataset?: string } | null;
  const initial = state?.result && state.dataset === draft.dataset ? state.result : null;
  const [result, setResult] = useState<SurveyResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasAnswers = Object.keys(draft.answers).length > 0;

  async function fetchResult(ageGroup: string | null) {
    setBusy(true); setError(null);
    const body: SurveyRequest = { ageGroup, answers: Object.values(draft.answers) };
    try { setResult(await request<SurveyResult>('/survey/result', draft.dataset, { method: 'POST', body: JSON.stringify(body) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '결과를 불러오지 못했어요.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!initial && hasAnswers) void fetchResult(draft.ageGroup);
    // 처음 한 번만 다시 요청한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!result && !hasAnswers) return <div className="container"><EmptyResult /></div>;
  if (error && !result) return <div className="container page"><ErrorNotice message={error} retry={() => fetchResult(draft.ageGroup)} /><Link to="/survey" className="text-link">응답 수정하기</Link></div>;
  if (!result) return <div className="container"><Loading /></div>;
  return <Report result={result} busy={busy} error={error} onPickAge={fetchResult} />;
}

function Report({ result, busy, error, onPickAge }: { result: SurveyResult; busy: boolean; error: string | null; onPickAge: (age: string) => void }) {
  const { meta, draft, setAgeGroup, resetSurvey } = useApp();
  const navigate = useNavigate();
  const period = result.referenceMonths.length === 2 ? `${monthLabel(result.referenceMonths[0])} ~ ${monthLabel(result.referenceMonths[1])}` : '';
  const restart = () => { resetSurvey(); navigate('/survey'); };

  if (result.status === 'insufficient') return <div className="rs-page">
    <TopLine result={result} period={period} />
    <section className="rs-card rs-insufficient" aria-labelledby="insufficient-title">
      <div className="rs-insufficient-symbol" aria-hidden="true">…</div>
      <h1 id="insufficient-title">비교할 단서가 조금 더 필요해요</h1>
      {result.reason && <p>{result.reason}</p>}
      <div className="rs-count"><strong>{result.comparedItems}<span> / {result.minimumItems}개</span></strong><span>비교할 수 있는 문항 / 최소 필요 문항</span></div>
      <div className="rs-actions">
        <Link className="button primary" to="/survey">응답 이어서 하기</Link>
        {result.nextAction && <Link className="button secondary" to={result.nextAction.path}>{result.nextAction.label} →</Link>}
      </div>
      {result.nextAction?.message && <p className="rs-muted">{result.nextAction.message}</p>}
    </section>
    <Excluded items={result.excluded} />
    <Source text={result.source} />
  </div>;

  const matchLabels = result.matches.map(m => m.label).join(' · ');
  const evidenceLabel = result.evidenceGroup?.label ?? matchLabels;
  const peer = result.peerComparison;

  return <div className="rs-page">
    <TopLine result={result} period={period} />

    <section className="rs-hero" aria-labelledby="match-title">
      <div>
        <p className="rs-eyebrow">가장 비슷한 연령대</p>
        <h1 id="match-title" className="rs-match">{matchLabels}</h1>
        <p className="rs-sentence">응답 패턴이 {matchLabels} 집단의 통계와 가장 비슷합니다.</p>
        {result.nearTie?.isNear && result.nearTie.second && <p className="rs-sub">{withJosa(result.nearTie.second.label, '와', '과')}도 비슷합니다.</p>}
        {result.patternClarity === 'weak' && <p className="rs-sub">응답 패턴이 뚜렷하지 않아요. 여러 연령대와 비슷하게 나올 수 있어요.</p>}
        {result.matches.length > 1 && <p className="rs-sub">공동 1위예요. 아래 근거는 {evidenceLabel} 기준으로 보여 드려요.</p>}
        {result.resultType.name && <p className="rs-type"><strong>{result.resultType.name}</strong>{result.resultType.description && <span>{result.resultType.description}</span>}</p>}
      </div>
      <div className="rs-hero-side">
        <span className="rs-hero-rank">1위</span>
        <span>{result.comparedItems}개 문항으로 비교했어요</span>
      </div>
    </section>

    <div className="rs-grid">
      <section className="rs-card" aria-labelledby="ranking-title">
        <div className="rs-card-head"><h2 id="ranking-title">연령대별 순위</h2><span className="rs-chip">6개 연령대 비교</span></div>
        <p className="rs-muted">응답 패턴과 각 연령대 통계가 얼마나 가까운지 순서대로 보여 드려요.</p>
        <ol className="rs-ranking">
          {result.rankings.map(item => {
            const best = result.matches.some(m => m.id === item.ageGroup);
            const near = result.nearTie?.isNear && result.nearTie.second?.id === item.ageGroup;
            return <li key={item.ageGroup} className={best ? 'best' : near ? 'near' : ''}>
              <span className="rs-rank-num">{item.rank}</span>
              <span className="rs-rank-label">{item.label}</span>
              <span className="rs-tags">
                {item.isTied && <span className="rs-tag">공동</span>}
                {best && <span className="rs-tag brand">가장 비슷함</span>}
                {near && <span className="rs-tag">근소한 차이</span>}
              </span>
            </li>;
          })}
        </ol>
      </section>

      <section className="rs-card" aria-labelledby="peer-title">
        {peer ? <>
          <div className="rs-card-head"><h2 id="peer-title">{peer.ageGroup.label} 이용자 통계와 견줘 보면</h2></div>
          {!peer.matchesStated && peer.statedDiffers && <p className="rs-callout">{peer.statedDiffers}</p>}
          {peer.more.length + peer.less.length === 0
            ? <p className="rs-muted">{peer.ageGroup.label} 이용자 통계와 크게 다른 항목은 없었어요.</p>
            : <ul className="rs-peer-list">
              {peer.more.map(item => <li key={item.questionId}><span className="rs-dir more" aria-hidden="true">↑</span>{item.message}</li>)}
              {peer.less.map(item => <li key={item.questionId}><span className="rs-dir less" aria-hidden="true">↓</span>{item.message}</li>)}
            </ul>}
          {peer.suggestion && <p className="rs-suggestion"><span aria-hidden="true">✦</span>{peer.suggestion.message}</p>}
          <p className="rs-note">{peer.note}</p>
          {meta && <AgePicker current={draft.ageGroup} ages={meta.ageGroups} busy={busy} label="다른 연령대와 견주기" onPick={age => { setAgeGroup(age); onPickAge(age); }} />}
        </> : <>
          <div className="rs-card-head"><h2 id="peer-title">내 연령대 통계와 견줘 보기</h2><span className="rs-chip">선택 사항</span></div>
          <p className="rs-muted">연령대를 고르면 그 연령대 이용자 통계와 비교해 어느 쪽으로 더·덜 치우쳐 쓰는지 알려 드려요. 순위 계산에는 쓰지 않고 저장하지 않아요.</p>
          {meta && <AgePicker current={draft.ageGroup} ages={meta.ageGroups} busy={busy} onPick={age => { setAgeGroup(age); onPickAge(age); }} />}
          {draft.ageGroup && !busy && <p className="rs-note">비교할 수 있는 문항이 부족해 이 연령대와의 비교를 만들지 못했어요.</p>}
        </>}
        {error && <p className="inline-error" role="alert">{error}</p>}
      </section>
    </div>

    <div className="rs-grid">
      <EvidenceCard title="이런 습관이 닮았어요" tone="similar" items={result.closest} group={evidenceLabel} />
      <EvidenceCard title="이런 습관은 달라요" tone="different" items={result.farthest} group={evidenceLabel} />
    </div>

    <details className="rs-card rs-method">
      <summary>결과는 어떻게 계산했나요?</summary>
      <p>답한 문항만 모아 내 응답 안에서 서비스별 비중을 맞춘 뒤, 6개 연령대 이용자 통계({period})와 같은 방식으로 견줘 가장 가까운 순서를 정했어요. ‘사용 안 함’·‘잘 모르겠음’과 통계가 없는 문항은 비교에서 빼요.</p>
      <p>실제 나이를 추정하거나 개인의 이용 기록을 분석한 결과가 아니에요. 스스로 답한 응답과 집단 통계의 패턴을 비교한 결과예요.</p>
      <Link className="text-link" to="/data">데이터와 비교 기준 알아보기</Link>
    </details>
    <Excluded items={result.excluded} />

    <div className="rs-actions bottom">
      <Link className="button primary" to="/explore">세대별 통계 살펴보기 →</Link>
      <Link className="button secondary" to="/survey">응답 수정하기</Link>
      <button type="button" className="text-link" onClick={restart}>처음부터 다시 하기</button>
    </div>
    <Source text={result.source} />
  </div>;
}

function TopLine({ result, period }: { result: SurveyResult; period: string }) {
  return <div className="rs-topline">
    <span className="rs-status"><span aria-hidden="true">●</span>나의 패턴 리포트</span>
    <span>{period && `${period} 통계 기준 · `}{result.answeredCount}개 문항 응답{result.isMock ? ' · 예시 데이터' : ''}</span>
  </div>;
}

const metricLabel = (e: Evidence) => e.metric === 'days' ? '최근 7일 이용일' : '이용한 날 하루 시간';
const fmt = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value);

function EvidenceCard({ title, tone, items, group }: { title: string; tone: 'similar' | 'different'; items: Evidence[]; group: string }) {
  return <section className={`rs-card rs-evidence ${tone}`}>
    <div className="rs-card-head"><h2>{title}</h2><span className="rs-chip">{items.length}개 항목</span></div>
    {items.length === 0 ? <p className="rs-muted">보여 드릴 항목이 없어요.</p> : <ul>
      {items.map(item => <li key={item.questionId}>
        <div className="rs-ev-title"><strong>{item.name}</strong><span>{metricLabel(item)}</span>
          {tone === 'different' && item.direction !== 'similar' && <span className={`rs-tag ${item.direction}`}>{item.direction === 'more' ? '더 치우침' : '덜 치우침'}</span>}
        </div>
        <dl className="rs-ev-values">
          <div><dt>내 응답</dt><dd>{fmt(item.userValue)}{item.unit}</dd></div>
          <div><dt>{group} 통계</dt><dd>{fmt(item.groupValue)}{item.unit}</dd></div>
        </dl>
      </li>)}
    </ul>}
    {tone === 'different' && items.length > 0 && <p className="rs-note">‘더·덜 치우침’은 내 응답 안에서 다른 서비스와 견준 상대적인 비중이에요. 사용량이 몇 분 더 많다는 뜻은 아니에요.</p>}
  </section>;
}

function AgePicker({ current, ages, busy, label, onPick }: { current: string | null; ages: { id: string; label: string }[]; busy: boolean; label?: string; onPick: (id: string) => void }) {
  return <div className="rs-age" role="group" aria-label={label ?? '비교할 연령대 고르기'}>
    {label && <span className="rs-age-label">{label}</span>}
    {ages.map(age => <button key={age.id} type="button" aria-pressed={current === age.id} disabled={busy} onClick={() => onPick(age.id)}>{age.label}</button>)}
    {busy && <span className="rs-muted" role="status">불러오는 중…</span>}
  </div>;
}

const reasonText: Record<string, string> = { not_used: '사용 안 함', unknown: '잘 모르겠음', group_missing: '비교할 통계 없음' };
function Excluded({ items }: { items: SurveyResult['excluded'] }) {
  if (!items.length) return null;
  return <details className="rs-card rs-method"><summary>비교에서 뺀 문항 {items.length}개</summary>
    <ul className="rs-excluded">{items.map(item => <li key={item.questionId}><strong>{item.name}</strong><span>{reasonText[item.reason] ?? item.reason}</span></li>)}</ul>
  </details>;
}

function Source({ text }: { text: string | null }) {
  return text ? <p className="source rs-source">출처: {text}</p> : null;
}
