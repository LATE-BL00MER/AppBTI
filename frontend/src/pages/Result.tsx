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
        <p className="rs-sentence">전체 응답 패턴은 {asGroup(matchLabels)}의 통계와 가장 가까워요.</p>
        {result.nearTie?.isNear && result.nearTie.second && <p className="rs-sub">{withJosa(result.nearTie.second.label, '와', '과')}도 비슷합니다.</p>}
        {result.patternClarity === 'weak' && <p className="rs-sub">응답 패턴이 뚜렷하지 않아요. 여러 연령대와 비슷하게 나올 수 있어요.</p>}
        {result.matches.length > 1 && <p className="rs-sub">공동 1위예요. 아래 근거는 {evidenceLabel} 기준으로 보여 드려요.</p>}
        {result.resultType.name && <p className="rs-type"><strong>{result.resultType.name}</strong>{result.resultType.description && <span>{result.resultType.description}</span>}</p>}
      </div>
      <div className="rs-hero-side">
        {/* 1위는 왼쪽 문구와 겹쳐서, 결과를 얼마나 많은 근거로 냈는지(비교 문항 수)를 크게 보여 준다. */}
        <span className="rs-hero-rank"><span>{result.comparedItems}<small>개</small></span></span>
        <span>비교한 문항</span>
      </div>
    </section>

    <div className="rs-grid">
      <section className="rs-card" aria-labelledby="ranking-title">
        <div className="rs-card-head"><h2 id="ranking-title">연령대별 순위</h2><span className="rs-chip">6개 연령대 비교</span></div>
        <p className="rs-muted">응답 패턴과 각 연령대 통계가 얼마나 가까운지 순서대로 보여 드려요. 막대가 길수록 가까워요.</p>
        <ol className="rs-ranking">
          {result.rankings.map(item => {
            // 가까움 막대: 가장 가까운 연령대가 꽉 찬 막대, 가장 먼 연령대가 가장 짧은 막대. 거리 숫자는 보여 주지 않는다.
            const ds = result.rankings.map(r => r.distance);
            const dMin = Math.min(...ds), dMax = Math.max(...ds);
            const close = dMax > dMin ? (dMax - item.distance) / (dMax - dMin) : 1;
            const best = result.matches.some(m => m.id === item.ageGroup);
            const near = result.nearTie?.isNear && result.nearTie.second?.id === item.ageGroup;
            return <li key={item.ageGroup} className={best ? 'best' : near ? 'near' : ''}>
              <span className="rs-rank-num">{item.rank}</span>
              <span className="rs-rank-label">{item.label}</span>
              <span className="rs-rank-bar" aria-hidden="true"><i style={{ width: `${12 + close * 88}%` }} /></span>
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

    <PatternMapCard result={result} />
    {/* 비슷한·먼 항목은 지도 아래 토글 안에 접어 둔다. */}
    <details className="rs-card rs-items-toggle">
      <summary>비슷한 항목과 다른 항목 보기</summary>
      <div className="rs-grid">
        <EvidenceCard title={result.closestMode === 'values' ? '서비스 사이 비중이 비슷한 항목' : '응답과 통계가 가까운 항목'} tone="similar"
          mode={result.closestMode} items={result.closest} group={evidenceLabel} />
        <EvidenceCard title="상대 이용 패턴이 먼 항목" tone="different" mode={result.closestMode} items={result.farthest} group={evidenceLabel} />
      </div>
    </details>

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

// 목업처럼 이름이 이미 '○집단'이면 '집단'을 다시 붙이지 않는다.
const asGroup = (label: string) => label.endsWith('집단') ? label : `${label} 집단`;
const metricLabel = (e: Evidence) => e.metric === 'days' ? '최근 7일 이용일' : '이용한 날 하루 시간';
const fmt = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value);

function EvidenceCard({ title, tone, mode, items, group }: { title: string; tone: 'similar' | 'different'; mode: SurveyResult['closestMode']; items: Evidence[]; group: string }) {
  // 먼 항목, 그리고 숫자까지 가까운 항목이 없을 때의 가까운 항목은 점 두 개(상대 비중)로 보여 준다.
  const relative = tone === 'different' || mode === 'values';
  return <section className={`rs-card rs-evidence ${tone}`}>
    <div className="rs-card-head"><h2>{title}</h2><span className="rs-chip">{items.length}개 항목</span></div>
    {relative && items.length > 0 && <p className="rs-legend"><span className="me">●</span> 나 <span className="group">◇</span> {group}</p>}
    {items.length === 0 ? <p className="rs-muted">보여 드릴 항목이 없어요.</p> : <ul>
      {items.map(item => <li key={item.questionId}>
        <div className="rs-ev-title"><strong>{item.name}</strong><span>{metricLabel(item)}</span>
          {tone === 'different' && item.direction !== 'similar' && <span className={`rs-tag ${item.direction}`}>{item.direction === 'more' ? '더 치우침' : '덜 치우침'}</span>}
        </div>
        {relative ? <>
          <DotBar item={item} group={group} />
        </> : <PairBars item={item} group={group} />}
      </li>)}
    </ul>}
  </section>;
}

// 시간은 계산용 대표 분(예: 84.9분) 대신 설문 선택지 문구로, 일수는 숫자와 환산 안내로 보여 준다.
// 선택지 문구에 괄호가 있으면 괄호 안 범위만 쓴다. 예: '잠깐 확인만 해요 (3분 이내)' → '3분 이내'
const shortLabel = (label: string) => label.match(/\(([^)]+)\)/)?.[1] ?? label;
const userText = (e: Evidence) => e.userLabel ? shortLabel(e.userLabel) : `${fmt(e.userValue)}${e.unit}`;
const groupText = (e: Evidence) => e.metric === 'time' && e.groupLabel ? shortLabel(e.groupLabel) : `${fmt(e.groupValue)}${e.unit}`;

/** 화면 수치(나 vs 집단)를 나란히 그린다. 시간은 선택지 구간 순서(1~5)로 막대 길이를 정한다. */
function PairBars({ item, group }: { item: Evidence; group: string }) {
  const byChoice = item.metric === 'time' && item.userChoice != null && item.groupChoice != null;
  const max = byChoice ? 5 : item.metric === 'days' ? 7 : Math.max(item.userValue, item.groupValue) * 1.15 || 1;
  const width = (value: number) => `${Math.min(value / max * 100, 100)}%`;
  const me = byChoice ? item.userChoice! : item.userValue, them = byChoice ? item.groupChoice! : item.groupValue;
  return <dl className="rs-bars">
    <div><dt>나</dt><dd><span className="rs-bar"><i className="me" style={{ width: width(me) }} /></span><b>{userText(item)}</b></dd></div>
    <div><dt>{group}</dt><dd><span className="rs-bar"><i style={{ width: width(them) }} /></span><b>{groupText(item)}</b></dd></div>
  </dl>;
}

/** 나(●)와 연령대(◆) 각자의 '평소 대비 비중'을 한 막대에 찍는다. 두 점이 가까울수록 상대 이용 패턴이 가깝다. 로그 눈금이라 ½배와 2배가 같은 거리다. */
function DotBar({ item, group }: { item: Evidence; group: string }) {
  const LIMIT = Math.log(4); // 4배(¼배) 바깥은 끝에 붙인다.
  const pos = (r: number) => 50 + Math.max(-1, Math.min(1, Math.log(r) / LIMIT)) * 50;
  const me = pos(item.userRelative), them = pos(item.groupRelative);
  const tone = item.direction === 'similar' ? 'similar' : item.direction;
  return <div className="rs-dot" role="img" aria-label={`${item.name}: 나와 ${group}의 평소 대비 비중`}>
    <span className="rs-dot-track">
      <span className="rs-dot-mid" aria-hidden="true" />
      <i className={tone} style={{ left: `${Math.min(me, them)}%`, width: `${Math.abs(me - them)}%` }} />
      <b className="me" style={{ left: `${me}%` }} aria-hidden="true" />
      {/* 연령대 점은 속이 빈 테두리로 내 점 위에 그려, 완전히 겹쳐도 ● 둘레의 ◇로 보이게 한다. */}
      <b className="group" style={{ left: `${them}%` }} aria-hidden="true" />
    </span>
    <span className="rs-dot-scale" aria-hidden="true"><span>다른 서비스보다 덜 쓰는 편</span><span>많이 쓰는 편</span></span>
  </div>;
}

/** 응답 패턴 지도. 나(★)와 6개 연령대(●)의 응답 패턴을 2차원으로 줄여 찍는다. 점 사이 거리가 대략적인 패턴 차이다. */
function PatternMapCard({ result }: { result: SurveyResult }) {
  const map = result.patternMap;
  if (!map) return null;
  // 가로·세로를 같은 눈금(unit)으로 그려 거리가 틀어지지 않게 하고, 높이는 점이 퍼진 범위에 맞춘다.
  const W = 640, PAD = 64, PAD_Y = 52;
  const xs = map.points.map(p => p.x), ys = map.points.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
  const unit = Math.min((W - 2 * PAD) / Math.max(xMax - xMin, 0.2), (420 - 2 * PAD_Y) / Math.max(yMax - yMin, 0.01));  // 세로로 퍼져도 높이 420 이내
  const H = Math.max(Math.round((yMax - yMin) * unit + 2 * PAD_Y), 180);
  const xOffset = (W - (xMax - xMin) * unit) / 2, yOffset = (H - (yMax - yMin) * unit) / 2;
  const px = (x: number) => xOffset + (x - xMin) * unit, py = (y: number) => yOffset + (yMax - y) * unit;
  const me = map.points.find(p => p.isUser)!;
  const top = result.matches[0]?.id, focus = result.evidenceGroup?.id;
  const rank = (id: string) => result.rankings.find(r => r.ageGroup === id)?.rank;
  // 이름표 자리: 오른쪽·왼쪽·위·아래 중 다른 이름표·점과 겹치지 않고 그림 안에 들어가는 첫 자리를 고른다.
  type Box = { x1: number; y1: number; x2: number; y2: number };
  const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const taken: Box[] = map.points.map(p => ({ x1: px(p.x) - 14, y1: py(p.y) - 14, x2: px(p.x) + 14, y2: py(p.y) + 14 }));
  taken.push({ x1: px(me.x) - 12, y1: py(me.y) + 14, x2: px(me.x) + 12, y2: py(me.y) + 32 });  // '나' 글자
  const labels = new Map<string, { x: number; y: number; anchor: 'start' | 'end' | 'middle' }>();
  map.points.filter(p => !p.isUser).sort((a, b) => (rank(a.id) ?? 9) - (rank(b.id) ?? 9)).forEach(p => {
    const text = `${rank(p.id)}위 ${p.label}`, w = text.length * 16, cx = px(p.x), cy = py(p.y);  // 한글 13px 기준 넉넉한 너비
    const options = [
      { x: cx + 15, y: cy + 5, anchor: 'start' as const, box: { x1: cx + 15, y1: cy - 9, x2: cx + 15 + w, y2: cy + 9 } },
      { x: cx - 15, y: cy + 5, anchor: 'end' as const, box: { x1: cx - 15 - w, y1: cy - 9, x2: cx - 15, y2: cy + 9 } },
      { x: cx, y: cy - 18, anchor: 'middle' as const, box: { x1: cx - w / 2, y1: cy - 32, x2: cx + w / 2, y2: cy - 14 } },
      { x: cx, y: cy + 30, anchor: 'middle' as const, box: { x1: cx - w / 2, y1: cy + 16, x2: cx + w / 2, y2: cy + 34 } },
      // 가장자리 점은 위·아래 자리를 점 쪽으로 붙여 그림 밖으로 나가지 않게 한다.
      { x: cx + 10, y: cy - 18, anchor: 'end' as const, box: { x1: cx + 10 - w, y1: cy - 32, x2: cx + 10, y2: cy - 14 } },
      { x: cx + 10, y: cy + 30, anchor: 'end' as const, box: { x1: cx + 10 - w, y1: cy + 16, x2: cx + 10, y2: cy + 34 } },
      { x: cx - 10, y: cy - 18, anchor: 'start' as const, box: { x1: cx - 10, y1: cy - 32, x2: cx - 10 + w, y2: cy - 14 } },
      { x: cx - 10, y: cy + 30, anchor: 'start' as const, box: { x1: cx - 10, y1: cy + 16, x2: cx - 10 + w, y2: cy + 34 } },
    ];
    const inside = (o: typeof options[number]) => o.box.x1 >= 0 && o.box.x2 <= W && o.box.y1 >= 0 && o.box.y2 <= H;
    // 겹치지 않고 그림 안에 들어가는 자리 → 없으면 그림 안에 들어가는 자리 → 없으면 오른쪽
    const ok = options.find(o => inside(o) && !taken.some(t => hit(t, o.box))) ?? options.find(inside) ?? options[0];
    taken.push(ok.box);
    labels.set(p.id, { x: ok.x - cx, y: ok.y - cy, anchor: ok.anchor });
  });
  return <section className="rs-card rs-map-card" aria-labelledby="map-title">
    <div className="rs-card-head"><h2 id="map-title">응답 패턴 지도</h2><span className="rs-chip">대략적인 위치</span></div>
    <svg className="rs-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`나와 6개 연령대의 응답 패턴 지도. 가장 가까운 연령대는 ${result.matches.map(m => m.label).join(', ')}`}>
      {map.points.filter(p => !p.isUser && (p.id === top || p.id === focus)).map(p =>
        <line key={`l-${p.id}`} x1={px(me.x)} y1={py(me.y)} x2={px(p.x)} y2={py(p.y)} className={p.id === top ? 'top' : 'focus'} />)}
      {map.points.filter(p => !p.isUser).map(p => {
        const cls = p.id === top ? 'top' : p.id === focus ? 'focus' : '';
        return <g key={p.id} className={`rs-map-age ${cls}`} transform={`translate(${px(p.x)} ${py(p.y)})`}>
          <circle r={p.id === top ? 11 : 8} />
          <text x={labels.get(p.id)?.x} y={labels.get(p.id)?.y} textAnchor={labels.get(p.id)?.anchor}>{rank(p.id)}위 {p.label}</text>
        </g>;
      })}
      <g className="rs-map-me" transform={`translate(${px(me.x)} ${py(me.y)})`}>
        <path d="M0,-13 L3.8,-4.2 13,-4 5.8,2.3 8.1,11.5 0,6.3 -8.1,11.5 -5.8,2.3 -13,-4 -3.8,-4.2 Z" />
        <text y={28} textAnchor="middle">나</text>
      </g>
    </svg>
    <p className="rs-map-legend"><span className="me">★</span> 나 <span className="top">●</span> 가장 가까운 연령대{focus && focus !== top && <> <span className="focus">●</span> 고른 연령대</>} <span className="other">●</span> 다른 연령대</p>
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
