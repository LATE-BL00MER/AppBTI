import { createContext, useContext, useState, type ReactNode } from 'react';
import { useData } from './api/client';
import type { Answer, Meta } from './api/types';

interface Draft { answers: Answer[]; isExample: boolean; dataset: string }
function restore(): Draft {
  try {
    const value = JSON.parse(sessionStorage.getItem('appbti:draft') || 'null') as Draft | null;
    if (value && ['basic', 'time'].includes(value.dataset) && Array.isArray(value.answers)
      && value.answers.every(a => a && typeof a.minorCode === 'string' && (a.days === null || typeof a.days === 'number') && (a.minutes === null || typeof a.minutes === 'number'))) return value;
  } catch { /* 브라우저 저장소가 막혀 있어도 체험은 계속한다. */ }
  return { answers: [], isExample: false, dataset: 'basic' };
}
const initial = restore();
interface State {
  meta: Meta | null; error: string | null; reload: () => void; draft: Draft;
  setAnswers: (answers: Answer[], isExample?: boolean) => void;
  changeDataset: (dataset: string) => void;
}
const AppContext = createContext<State | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const { data: meta, error, reload } = useData<Meta>('/meta', draft.dataset);
  const save = (value: Draft) => {
    setDraft(value);
    try { sessionStorage.setItem('appbti:draft', JSON.stringify(value)); } catch { /* 메모리 상태로 계속한다. */ }
  };
  return <AppContext.Provider value={{ meta, error, reload, draft,
    setAnswers: (answers, isExample = false) => save({ answers, isExample, dataset: draft.dataset }),
    changeDataset: dataset => save({ answers: [], isExample: false, dataset }),
  }}>{children}</AppContext.Provider>;
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('앱 상태가 준비되지 않았습니다.');
  return value;
}
