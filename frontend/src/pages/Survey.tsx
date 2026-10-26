import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../api/client';
import type { Answer, Questions } from '../api/types';
import { ErrorNotice, Loading, monthLabel } from '../components/Common';
import { useApp } from '../state';

export default function Survey() {
  const { meta, draft, setAnswers } = useApp();
  const { data, error, reload } = useData<Questions>('/survey/questions', draft.dataset);
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const groups = data ? [...new Set(data.questions.map(q => q.major))] : [];
  const answered = draft.answers.filter(a => a.days !== null).length;
  useEffect(() => { if (step > 0) { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start' }); } }, [step]);
  useEffect(() => { setStep(0); }, [draft.dataset]);
  // 예시 결과를 본 뒤 설문을 시작하면 예시 응답을 자신의 응답으로 남기지 않는다.
  useEffect(() => { if (draft.isExample) setAnswers([]); }, [draft.isExample, setAnswers]);
  if (error) return <div className="container page"><ErrorNotice message={error} retry={reload} /></div>;
  if (!data || !meta) return <div className="container"><Loading /></div>;
  if (!meta.comparisonEnabled) return <div className="container page"><div className="notice"><h1>비교 기준을 준비하고 있어요.</h1><p>집단 통계의 정의와 비교 방식을 확인 중입니다. 세대별 통계는 바로 살펴볼 수 있어요.</p><Link className="button primary" to="/explore">세대별 탐색하기</Link></div></div>;
  const active = groups[step];
  const questions = data.questions.filter(q => q.major === active);
  const choices = [{ label: '사용 안 함', detail: '0일', value: 0 }, { label: '가끔 생각날 때', detail: '월 1~3일', value: 2 }, { label: '일주일에 한두 번', detail: '월 4~9일', value: 7 }, { label: '이틀에 한 번쯤', detail: '월 10~19일', value: 15 }, { label: '일주일에 여러 번', detail: `월 20~${Math.min(27, data.maxDays - 1)}일`, value: 24 }, { label: '거의 매일', detail: `월 ${Math.min(28, data.maxDays)}~${data.maxDays}일`, value: data.maxDays }];
  const update = (code: string, patch: Partial<Answer>) => {
    const current = draft.answers.find(a => a.minorCode === code) || { minorCode: code, days: null, minutes: null };
    const value = { ...current, ...patch };
    if (value.days === 0 || value.days === null) value.minutes = null;
    setAnswers([...draft.answers.filter(a => a.minorCode !== code), value]);
  };
  return <div className="container survey-page">
    <aside className="survey-aside"><Link to="/" className="back-link">← 서비스 소개</Link><p className="eyebrow">내 패턴 알아보기</p><h1>평소의 나를<br />떠올려 주세요.</h1><p>정답은 없어요. 최근 한 달을 생각하며<br />가장 가까운 구간을 골라주세요.</p><div className="survey-progress"><div><strong>{answered}<span> / {data.questions.length} 응답</span></strong><span>{Math.round(answered / data.questions.length * 100)}%</span></div><progress value={answered} max={data.questions.length} aria-label="전체 설문 응답 진행률" /></div><nav className="step-nav" aria-label="설문 분야">{groups.map((group, index) => <button key={group} className={step === index ? 'active' : ''} onClick={() => setStep(index)} aria-current={step === index ? 'step' : undefined}><span>{group}</span><span>{data.questions.filter(q => q.major === group && draft.answers.some(a => a.minorCode === q.code && a.days !== null)).length}/{data.questions.filter(q => q.major === group).length}</span></button>)}</nav><p className="privacy-note">응답은 이 탭에서만 임시 보관해요.<br />서버에는 저장하지 않습니다.</p></aside>
    <section className="survey-main"><div className="survey-section-heading"><span className="eyebrow">{step + 1} / {groups.length} 분야</span><h2 ref={heading} tabIndex={-1}>{active}</h2><p>{monthLabel(data.month)} 집단 통계와 비교합니다. 선택한 구간의 대표 일수로 계산해요.</p></div>
      {questions.map((question, index) => {
        const answer = draft.answers.find(a => a.minorCode === question.code);
        return <fieldset className="question" key={question.code}><legend><span className="question-number">Q{data.questions.findIndex(q => q.code === question.code) + 1}.</span> {question.name},<br />한 달에 며칠 정도 이용하나요?</legend><p className="question-description">{question.description}</p><div className="answer-grid">{choices.map(choice => <label className={`answer-option ${answer?.days === choice.value ? 'selected' : ''}`} key={choice.value}><input type="radio" name={question.code} value={choice.value} checked={answer?.days === choice.value} onChange={() => update(question.code, { days: choice.value })} /><span className="radio-mark" /><span><strong>{choice.label}</strong><small>{choice.detail}</small></span></label>)}</div>
          <div className="question-footer"><label className="skip-option"><input type="radio" name={question.code} checked={answer?.days === null} onChange={() => update(question.code, { days: null })} />잘 모르겠어요 · 비교에서 제외</label>{answer?.days !== undefined && answer.days !== null && <span>비교에 사용할 응답: {answer.days}일</span>}</div>
          {data.timeAvailable && answer?.days !== undefined && answer.days !== null && answer.days > 0 && <label className="time-input">사용하는 날 하루 평균 이용시간 <span>(선택)</span><div><input aria-label={`${question.name} 하루 평균 분`} type="number" min="0" max="1440" value={answer.minutes === null || answer.minutes === undefined ? '' : answer.minutes} onChange={e => { const value = e.target.value === '' ? null : Number(e.target.value); if (value === null || Number.isFinite(value) && value >= 0 && value <= 1440) update(question.code, { minutes: value }); }} placeholder="예: 30" /><span>분</span></div></label>}
          <span className="sr-only">이 분야의 {index + 1}번째 문항</span>
        </fieldset>;
      })}
      <div className="survey-navigation"><button className="button secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>이전 분야</button>{step < groups.length - 1 ? <button className="button primary" onClick={() => setStep(step + 1)}>다음 분야 <span aria-hidden="true">→</span></button> : <button className="button primary" onClick={() => navigate('/result')}>내 패턴 확인하기</button>}</div>
      <div className="survey-tip"><strong>모든 문항에 답하지 않아도 괜찮아요.</strong><p>‘사용 안 함’과 무응답은 구분됩니다. 이용자 기준 평균과 직접 비교할 수 없는 0일 응답, 제공되지 않은 항목은 제외해요. 최소 {data.minimumCategories}개 항목이 비교 가능해야 결과를 볼 수 있습니다.</p></div>
    </section>
  </div>;
}
