import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { request } from '../api/client';
import type { CountAnswer, CountQuestions, CountResult } from '../api/types';
import { monthLabel } from '../components/Common';
import { useApp } from '../state';

export default function CountSurvey({ data }: { data: CountQuestions }) {
  const { draft } = useApp();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, CountAnswer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { answerFormat, questions } = data;

  function update(questionId: string, answer?: CountAnswer) {
    setAnswers(previous => {
      const next = { ...previous };
      if (answer) next[questionId] = answer;
      else delete next[questionId];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<CountResult>('/survey/result', draft.dataset, {
        method: 'POST',
        body: JSON.stringify({ month: data.month, answers: questions.flatMap(q => answers[q.id] ? [answers[q.id]] : []) }),
      });
      navigate('/result', { state: { countResult: result, dataset: draft.dataset } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '결과를 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (!data.comparisonEnabled || !questions.length) return <div className="container page notice">
    <h1>설문 비교를 준비하고 있어요.</h1>
    <Link className="button primary" to="/explore">세대별 탐색하기</Link>
  </div>;

  const answered = questions.filter(q => answers[q.id]?.status === 'answered').length;
  return <div className="container survey-page">
    <form className="survey-main" onSubmit={submit}>
      <div className="survey-section-heading">
        <h1>지난달의 디지털 습관</h1>
        <p>{monthLabel(data.month)} 집단 통계와 비교해요. 최소 {data.minimumCategories}개 항목이 비교 가능해야 해요.</p>
        <p>{answered} / {questions.length}문항 응답</p>
      </div>
      {questions.map(question => {
        const answer = answers[question.id];
        return <fieldset className="question" key={question.id} disabled={busy}>
          <legend>{question.text}</legend>
          {question.guide && <p className="question-description">{question.guide}</p>}
          <label className="time-input">
            접속 횟수
            <div>
              <input type="number" inputMode="numeric" aria-label={`${question.name} 접속 횟수`}
                min={answerFormat.min} max={answerFormat.max ?? undefined} step={1}
                value={answer?.count ?? ''}
                onChange={event => {
                  const input = event.currentTarget;
                  const count = input.valueAsNumber;
                  if (!input.value) update(question.id);
                  else if (input.validity.valid && Number.isSafeInteger(count)) update(question.id, { questionId: question.id, status: 'answered', count });
                }} />
              <span>회</span>
            </div>
          </label>
          <div className="question-footer">
            {answerFormat.allowUnknown && <button type="button" className="button secondary" aria-pressed={answer?.status === 'unknown'} onClick={() => update(question.id, { questionId: question.id, status: 'unknown', count: null })}>모르겠음</button>}
            {answerFormat.allowSkip && <button type="button" className="button secondary" aria-pressed={answer?.status === 'skipped'} onClick={() => update(question.id, { questionId: question.id, status: 'skipped', count: null })}>건너뛰기</button>}
          </div>
        </fieldset>;
      })}
      {data.zeroCountPolicy === 'exclude_pending_denominator' && <p className="survey-tip">0회 응답은 비교에서 제외돼요.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="button primary" disabled={busy}>{busy ? '결과 준비 중…' : '내 패턴 확인하기'}</button>
    </form>
  </div>;
}
