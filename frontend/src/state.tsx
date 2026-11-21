import { createContext, useContext, useState, type ReactNode } from 'react';
import { useData } from './api/client';
import type { Meta, SurveyAnswer } from './api/types';

/** 설문 응답은 이 탭(sessionStorage)에만 둔다. 서버에 저장하지 않는다. */
interface Draft { answers: Record<string, SurveyAnswer>; ageGroup: string | null; dataset: string }
const STORAGE_KEY = 'appbti:draft:v2';
const empty = (dataset = 'basic'): Draft => ({ answers: {}, ageGroup: null, dataset });

function isAnswer(value: unknown): value is SurveyAnswer {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  if (typeof a.questionId !== 'string') return false;
  if (a.status === 'answered') return typeof a.value === 'number' && Number.isInteger(a.value);
  return (a.status === 'not_used' || a.status === 'unknown') && a.value === null;
}
function restore(): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') as Draft | null;
    if (value && typeof value.dataset === 'string' && value.answers && typeof value.answers === 'object'
      && Object.values(value.answers).every(isAnswer)
      && (value.ageGroup === null || typeof value.ageGroup === 'string')) return value;
  } catch { /* 브라우저 저장소가 막혀 있어도 체험은 계속한다. */ }
  return empty();
}
const initial = restore();

interface State {
  meta: Meta | null; error: string | null; reload: () => void; draft: Draft;
  setAnswer: (questionId: string, answer: SurveyAnswer | null) => void;
  setAgeGroup: (ageGroup: string | null) => void;
  resetSurvey: () => void;
  changeDataset: (dataset: string) => void;
}
const AppContext = createContext<State | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const { data: meta, error, reload } = useData<Meta>('/meta', draft.dataset);
  const update = (next: (previous: Draft) => Draft) => setDraft(previous => {
    const value = next(previous);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* 메모리 상태로 계속한다. */ }
    return value;
  });
  return <AppContext.Provider value={{ meta, error, reload, draft,
    setAnswer: (questionId, answer) => update(previous => {
      const answers = { ...previous.answers };
      if (answer) answers[questionId] = answer; else delete answers[questionId];
      return { ...previous, answers };
    }),
    setAgeGroup: ageGroup => update(previous => ({ ...previous, ageGroup })),
    resetSurvey: () => update(previous => empty(previous.dataset)),
    // 데이터 조건이 바뀌면 문항이 달라지므로 응답을 초기화한다.
    changeDataset: dataset => update(() => empty(dataset)),
  }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('앱 상태가 준비되지 않았습니다.');
  return value;
}
