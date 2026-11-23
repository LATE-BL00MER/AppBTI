import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { request, useData } from '../api/client';
import type { SurveyAnswer, SurveyQuestion, SurveyQuestions, SurveyRequest, SurveyResult } from '../api/types';
import { ErrorNotice, Loading } from '../components/Common';
import { useApp } from '../state';
import './survey.css';

/** 한 파트에 넣는 시간 문항 수. 같은 답 형식끼리 묶고, 길어지면 나눈다. */
const PART_SIZE = 5;

interface Part { metric: SurveyQuestion['metric']; questions: SurveyQuestion[] }

// 일수 문항을 먼저, 시간 문항을 그다음에 둔다. 각 형식 안에서는 서버가 준 id 순서를 지킨다.
function buildParts(questions: SurveyQuestion[]): Part[] {
  const parts: Part[] = [];
  for (const metric of ['days', 'time'] as const) {
    const items = questions.filter(q => q.metric === metric);
    const size = items.length <= PART_SIZE + 1 ? items.length : PART_SIZE;
    for (let i = 0; i < items.length; i += size) parts.push({ metric, questions: items.slice(i, i + size) });
  }
  return parts;
}

export default function Survey() {
  const { draft } = useApp();
  const { data, error, reload } = useData<SurveyQuestions>('/survey/questions', draft.dataset);
  if (error) return <div className="container page"><ErrorNotice message={error} retry={reload} /></div>;
  if (!data) return <div className="container"><Loading /></div>;
  if (!data.comparisonEnabled || !data.questions.length) return <div className="container page"><div className="notice">
    <h1>설문 비교를 준비하고 있어요.</h1>
    <p>집단 통계와 비교할 기준을 확인하는 중이에요. 세대별 통계는 바로 살펴볼 수 있어요.</p>
    <Link className="button primary" to="/explore">세대별 탐색하기</Link>
  </div></div>;
  return <SurveyForm key={draft.dataset} data={data} />;
}

function SurveyForm({ data }: { data: SurveyQuestions }) {
  // 연령대 선택은 결과 화면의 '내 연령대 통계와 견줘 보기'에서만 받는다(선택 사항). 결과에서 고른 값이 있으면 그대로 보낸다.
  const { draft, setAnswer } = useApp();
  const navigate = useNavigate();
  const parts = useMemo(() => buildParts(data.questions), [data.questions]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  // 파트가 실제로 바뀌었을 때만 제목으로 스크롤한다. '첫 실행 건너뛰기'는 개발 모드(StrictMode)에서
  // 효과가 두 번 실행돼 첫 화면부터 아래로 스크롤되는 문제가 있었다.
  const shownStep = useRef(step);

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);

  const ids = new Set(data.questions.map(q => q.id));
  // 문항이 바뀌었을 때 예전 응답이 섞이지 않게, 지금 문항에 있는 응답만 센다.
  const answers = Object.values(draft.answers).filter(a => ids.has(a.questionId));
  const responded = answers.length;
  const answeredCount = answers.filter(a => a.status === 'answered').length;
  const total = data.questions.length;
  const percent = Math.round(responded / total * 100);
  const part = parts[step];
  const isLast = step === parts.length - 1;
  const partDone = (p: Part) => p.questions.every(q => draft.answers[q.id]);

  async function submit() {
    if (busy) return;
    setBusy(true); setError('');
    const body: SurveyRequest = { ageGroup: draft.ageGroup, answers };
    try {
      const result = await request<SurveyResult>('/survey/result', draft.dataset, { method: 'POST', body: JSON.stringify(body) });
      navigate('/result', { state: { result, dataset: draft.dataset } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { setBusy(false); }
  }

  return <div className="sv-page">
    <div className="sv-progress" aria-label="설문 진행 상황">
      <div className="sv-progress-text">
        <span><b className="sv-part-dot">{step + 1}</b>{partTitle(part)} · 파트 {step + 1}/{parts.length}</span>
        <strong>{percent}% <small>({responded}/{total}문항 응답)</small></strong>
      </div>
      <progress value={responded} max={total} aria-label="전체 문항 응답 진행률" />
    </div>

    <header className="sv-part-card">
      <div className="sv-part-icon" aria-hidden="true">{part.metric === 'days' ? <CalendarIcon /> : <ClockIcon />}</div>
      <div>
        <p className="sv-eyebrow">PART {String(step + 1).padStart(2, '0')} · {part.metric === 'days' ? '이용한 날' : '하루 이용 시간'}</p>
        <h1 ref={heading} tabIndex={-1}>{partTitle(part)}</h1>
        <p>{part.metric === 'days'
          ? '최근 7일 동안 각 서비스를 며칠 이용했는지 골라주세요.'
          : '그 서비스를 이용한 날을 떠올리고, 하루에 보통 얼마나 쓰는지 골라주세요.'}</p>
      </div>
      <span className="sv-chip">{part.questions.length}문항</span>
    </header>

    {step === 0 && <p className="sv-tip" role="note">
      <span aria-hidden="true">✦</span>
      <span>정확하지 않아도 괜찮아요. 최근 7일을 떠올리며 가장 가까운 답을 골라 주세요. 쓰지 않는 서비스는 ‘사용 안 함’을 눌러주세요.
        응답은 이 탭에만 잠시 보관하고 서버에 저장하지 않아요.</span>
    </p>}

    <div className="sv-questions">
      {part.questions.map(question => {
        const number = data.questions.findIndex(q => q.id === question.id) + 1;
        const props = { question, number, answer: draft.answers[question.id], onChange: (a: SurveyAnswer | null) => setAnswer(question.id, a) };
        return question.metric === 'days'
          ? <DaysQuestion key={question.id} {...props} format={data.answerFormats.days} />
          : <TimeQuestion key={question.id} {...props} format={data.answerFormats.time} />;
      })}
    </div>


    {isLast && answeredCount < data.minimumItems && <p className="sv-notice" role="status">
      지금은 이용한다고 답한 문항이 {answeredCount}개예요. {data.minimumItems}개 이상이어야 비슷한 연령대를 찾을 수 있고, 적으면 결과 대신 세대별 탐색을 안내해요.
    </p>}
    {error && <p className="inline-error" role="alert">{error}</p>}

    <nav className="sv-nav" aria-label="파트 이동">
      {step === 0
        ? <Link className="button secondary" to="/">← 처음으로</Link>
        : <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>← 이전 파트</button>}
      <span className="sv-nav-hint">{isLast ? '답하지 않은 문항은 ‘잘 모르겠음’으로 처리돼요' : `파트 ${step + 1}/${parts.length}`}</span>
      {isLast
        ? <button type="button" className="button primary" disabled={busy} onClick={submit}>{busy ? '결과 준비 중…' : '결과 보기 →'}</button>
        : <button type="button" className="button primary" onClick={() => setStep(step + 1)}>다음 파트 →</button>}
    </nav>

    <ol className="sv-tracker" aria-label="파트 목록">
      {parts.map((p, index) => {
        const state = index === step ? '진행 중' : partDone(p) ? '응답 완료' : '대기';
        return <li key={index}><button type="button" aria-current={index === step ? 'step' : undefined} className={index === step ? 'current' : partDone(p) ? 'done' : ''} onClick={() => setStep(index)}>
          <span aria-hidden="true">{p.metric === 'days' ? <CalendarIcon /> : <ClockIcon />}</span>
          <span><strong>{partTitle(p)}</strong><small>{state}</small></span>
        </button></li>;
      })}
    </ol>
  </div>;
}

function partTitle(part: Part) {
  const names = [...new Set(part.questions.map(q => q.name))];
  if (part.metric === 'days') return '최근 7일, 며칠 이용했나요?';
  return names.length <= 3 ? names.join(' · ') : `${names.slice(0, 3).join(' · ')} 외`;
}

interface QuestionProps { question: SurveyQuestion; number: number; answer: SurveyAnswer | undefined; onChange: (answer: SurveyAnswer | null) => void }

function QuestionShell({ question, number, answer, onChange, allowNotUsed, allowUnknown, centered, children }: QuestionProps & { allowNotUsed: boolean; allowUnknown: boolean; centered?: boolean; children: ReactNode }) {
  const name = `q-${question.id}`;
  return <fieldset className={`sv-question${centered ? ' centered' : ''}${answer ? ' responded' : ''}`}>
    <legend>
      <span className="sv-qnum">QUESTION {String(number).padStart(2, '0')} · {question.name}</span>
      <span className="sv-qtext">{question.text}</span>
    </legend>
    {question.guide && <p className="sv-guide">{question.guide}</p>}
    {children}
    <div className="sv-extra">
      {allowNotUsed && <label className={`sv-pill${answer?.status === 'not_used' ? ' selected' : ''}`}>
        <input type="radio" name={name} checked={answer?.status === 'not_used'} onChange={() => onChange({ questionId: question.id, status: 'not_used', value: null })} />사용 안 함
      </label>}
      {allowUnknown && <label className={`sv-pill${answer?.status === 'unknown' ? ' selected' : ''}`}>
        <input type="radio" name={name} checked={answer?.status === 'unknown'} onChange={() => onChange({ questionId: question.id, status: 'unknown', value: null })} />잘 모르겠음
      </label>}
      {answer && <button type="button" className="sv-clear" onClick={() => onChange(null)}>선택 지우기</button>}
    </div>
  </fieldset>;
}

interface ScaleOption { value: number; short: string; full: string }

/**
 * Figma 설문의 원형 척도. 양 끝은 크고 가운데로 갈수록 작게, 왼쪽 보라 → 가운데 회색 → 오른쪽 초록.
 * 일수(1~7일)와 시간(5지선다) 문항이 같은 모양을 쓴다. 원 아래에 짧은 값, 고르면 전체 문구를 보여 준다.
 */
function Scale({ question, answer, onChange, options, ends }: QuestionProps & { options: ScaleOption[]; ends: [string, string, string] }) {
  const selected = answer?.status === 'answered' ? answer.value : null;
  const center = (options.length - 1) / 2;
  const tone = (index: number) => index < center ? 'low' : index > center ? 'high' : 'mid';
  const size = (index: number) => center === 0 ? 1 : Math.abs(index - center) / center;
  const chosen = options.find(o => o.value === selected);
  return <div className="sv-scale" style={{ ['--n' as string]: options.length }}>
    <div className="sv-scale-ends" aria-hidden="true">
      <span className="low">{ends[0]}</span><span className="mid">{ends[1]}</span><span className="high">{ends[2]}</span>
    </div>
    <div className="sv-scale-dots">
      {options.map((option, index) => <label key={option.value} className={`${tone(index)}${selected === option.value ? ' selected' : ''}`}
        style={{ ['--dot' as string]: `${26 + Math.round(size(index) * 18)}px` }}>
        <input type="radio" name={`q-${question.id}`} value={option.value} checked={selected === option.value}
          onChange={() => onChange({ questionId: question.id, status: 'answered', value: option.value })} />
        <span className="sv-dot" aria-hidden="true">{selected === option.value && <CheckIcon />}</span>
        <span className="sv-dot-label"><span className="sr-only">{option.full} </span><span aria-hidden="true">{option.short}</span></span>
      </label>)}
    </div>
    <p className="sv-scale-caption" aria-live="polite">{chosen ? chosen.full : answer?.status === 'not_used' ? '사용하지 않았어요' : answer?.status === 'unknown' ? '잘 모르겠어요' : '선택해 주세요'}</p>
  </div>;
}

function DaysQuestion(props: QuestionProps & { format: SurveyQuestions['answerFormats']['days'] }) {
  const { format } = props;
  const options = Array.from({ length: format.max - format.min + 1 }, (_, i) => format.min + i)
    .map(value => ({ value, short: `${value}${format.unit}`, full: `${value}${format.unit} 이용했어요` }));
  return <QuestionShell {...props} allowNotUsed={format.allowNotUsed} allowUnknown={format.allowUnknown} centered>
    <Scale {...props} options={options} ends={['거의 안 씀', '절반쯤', '매일']} />
  </QuestionShell>;
}

function TimeQuestion(props: QuestionProps & { format: SurveyQuestions['answerFormats']['time'] }) {
  const { format } = props;
  // "잠깐 확인만 해요 (3분 이내)" → 원 아래에는 괄호 안 "3분 이내"만, 고르면 전체 문구
  const options = format.choices.map(choice => {
    const match = /^(.*?)\s*\(([^)]*)\)$/.exec(choice.label);
    return { value: choice.value, short: match ? match[2] : choice.label, full: choice.label };
  });
  return <QuestionShell {...props} allowNotUsed={format.allowNotUsed} allowUnknown={format.allowUnknown} centered>
    <Scale {...props} options={options} ends={['짧게', '중간', '길게']} />
  </QuestionShell>;
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function CalendarIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
function ClockIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
