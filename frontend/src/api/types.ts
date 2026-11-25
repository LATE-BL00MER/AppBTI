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
  ageRelativeDays?: number | null; ageRelativeTime?: number | null;
}

export interface ExploreRanking {
  basis: 'relativeFrequency' | 'ageShare';
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
  userValue: number; groupValue: number | null; unit: string; difference: number;
  direction: 'more' | 'less' | 'similar';
  /** 응답 전체 크기를 뺀 뒤 이 항목의 상대 배수(1 = 비중이 같음). 화면 막대 위치용 */
  relativeRatio: number;
  /** 나·근거 연령대 각자의 평소(자기 평균) 대비 이 항목 비중. 점 두 개 막대 위치용 */
  userRelative: number; groupRelative: number;
  /** 시간 문항만: 내가 고른 선택지와 집단 시간이 속한 선택지 구간(번호·문구). 일수 문항은 null */
  userChoice: number | null; userLabel: string | null; groupChoice: number | null; groupLabel: string | null;
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
  /** similar: closest가 상대 비중·화면 수치 모두 가까운 항목 / values: 그런 항목이 없어 상대 비중만 가까운 항목(제목을 '항목별 이용 수치'로) */
  closestMode: 'similar' | 'values' | null;
  closest: Evidence[]; farthest: Evidence[];
  /** 응답 패턴 지도: 나와 6개 연령대를 2차원으로 줄인 좌표(-1~1). 비교 불가면 null */
  patternMap: { points: { id: string; label: string; x: number; y: number; isUser: boolean; distance: number | null }[]; explained: number } | null;
  excluded: { questionId: string; minorCode: string; name: string; reason: 'not_used' | 'unknown' | 'group_missing' | string }[];
  peerComparison: PeerComparison | null;
  resultType: { name: string | null; description: string | null; status: string };
  nextAction: { path: string; label: string; message: string } | null;
  isMock: boolean; source: string | null;
}

// ── 오류 본문 (docs/API.md 1-3) ──────────────────────────────
export interface ApiErrorBody { status: number; code: string; message: string }
