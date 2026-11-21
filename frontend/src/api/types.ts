// docs/API.md v2(PR #25 구현 기준)와 1:1로 대응한다. 화면에서 지표나 유사도를 다시 계산하지 않는다.

export interface AgeGroup { id: string; label: string }
export interface Minor { code: string; name: string; major: string; description: string | null }

export interface Meta {
  schemaVersion?: number;
  isMock: boolean; source: string | null; months: string[]; ageGroups: AgeGroup[];
  minorCategories: Minor[]; majorCategories: string[];
  metrics: { dailyTime: boolean; timeComparable: boolean; weightedReference: boolean };
  avgDaysDenominator: string | null; continuityBreaks: string[];
  quality: { rowCount: number; warningCount: number }; availableDatasets: string[]; dataset: string; comparisonEnabled: boolean;
  /** v1 하위 호환 필드. v2 화면은 쓰지 않는다. */
  zeroDaysPolicy: 'exclude' | 'include' | null;
  survey?: { questionCount: number | null; period: string | null; method: string; timeAvailable: boolean };
}

export interface Profile {
  month: string; ageGroup: string; minorCode: string; status: string;
  uu: number | null; avgDays: number | null; ageShare: number | null;
  referenceDays: number | null; relativeFrequency: number | null; avgDailyTime: number | null; segment: number;
}

export interface ExploreRanking {
  status: 'available' | 'unavailable'; reason: string | null;
  items: { rank: number; minorCode: string; name: string; value: number }[];
}

// ── 설문 (GET /survey/questions) ─────────────────────────────
export type SurveyMetric = 'days' | 'time';
export interface SurveyQuestion {
  id: string; minorCode: string; name: string; major: string;
  metric: SurveyMetric; text: string; guide: string | null;
}
export interface SurveyQuestions {
  period: string | null;
  questions: SurveyQuestion[];
  answerFormats: {
    days: { min: number; max: number; unit: string; allowNotUsed: boolean; allowUnknown: boolean };
    time: { choices: { value: number; label: string }[]; allowNotUsed: boolean; allowUnknown: boolean };
  };
  minimumItems: number;
  comparisonEnabled: boolean;
  timeAvailable: boolean;
}

// ── 설문 응답 (POST /survey/result 요청) ─────────────────────
export type SurveyAnswer =
  | { questionId: string; status: 'answered'; value: number }
  | { questionId: string; status: 'not_used' | 'unknown'; value: null };
export interface SurveyRequest { ageGroup: string | null; answers: SurveyAnswer[] }

// ── 결과 (POST /survey/result 응답) ──────────────────────────
export interface Ranking { ageGroup: string; label: string; rank: number; distance: number; isTied: boolean }
export interface Evidence {
  questionId: string; minorCode: string; name: string; metric: SurveyMetric;
  userValue: number; groupValue: number; unit: string; difference: number;
  direction: 'more' | 'less' | 'similar';
}
export interface PeerItem { questionId: string; minorCode: string; name: string; metric: SurveyMetric; relativeRatio: number; message: string }
export interface PeerComparison {
  ageGroup: AgeGroup; comparedItems: number;
  more: PeerItem[]; less: PeerItem[];
  suggestion: { questionId: string; message: string } | null;
  matchesStated: boolean; statedDiffers: string | null; note: string;
}
export interface SurveyResult {
  status: 'comparable' | 'insufficient';
  reasonCode: string | null; reason: string | null; method: string;
  referenceMonths: string[]; answeredCount: number; comparedItems: number; minimumItems: number;
  rankings: Ranking[]; matches: AgeGroup[];
  nearTie: { isNear: boolean; second: AgeGroup | null; gapRatio: number | null } | null;
  patternClarity: 'clear' | 'weak' | null;
  evidenceGroup: AgeGroup | null;
  closest: Evidence[]; farthest: Evidence[];
  excluded: { questionId: string; minorCode: string; name: string; reason: 'not_used' | 'unknown' | 'group_missing' | string }[];
  peerComparison: PeerComparison | null;
  resultType: { name: string | null; description: string | null; status: string };
  nextAction: { path: string; label: string; message: string } | null;
  isMock: boolean; source: string | null;
}

// ── 오류 본문 (docs/API.md 1-3) ──────────────────────────────
export interface ApiErrorBody { status: number; code: string; message: string }
