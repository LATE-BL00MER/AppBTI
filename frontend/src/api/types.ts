export interface AgeGroup { id: string; label: string }
export interface Minor { code: string; name: string; major: string; description: string }
export interface Meta {
  isMock: boolean; source: string; months: string[]; ageGroups: AgeGroup[];
  minorCategories: Minor[]; majorCategories: string[];
  metrics: { dailyTime: boolean; timeComparable: boolean; weightedReference: boolean };
  avgDaysDenominator: string | null; continuityBreaks: string[];
  quality: { rowCount: number; warningCount: number }; availableDatasets: string[]; dataset: string; comparisonEnabled: boolean;
  zeroDaysPolicy: 'exclude' | 'include' | null;
}
export interface Profile {
  month: string; ageGroup: string; minorCode: string; status: string;
  uu: number | null; avgDays: number | null; ageShare: number | null;
  referenceDays: number | null; relativeFrequency: number | null; avgDailyTime: number | null; segment: number;
}
export interface Answer { minorCode: string; days: number | null; minutes: number | null }
export interface Questions { month: string; questions: Minor[]; maxDays: number; timeAvailable: boolean; minimumCategories: number; zeroDaysPolicy: 'exclude' | 'include' | null }
export interface CountQuestions {
  month: string; comparisonEnabled: boolean; minimumCategories: number; zeroCountPolicy: string;
  answerFormat: { type: 'count'; min: number; max: number | null; allowUnknown: boolean; allowSkip: boolean };
  questions: { id: string; minorCode: string; name: string; major: string; text: string; guide: string | null }[];
}
export type CountAnswer = { questionId: string } & (
  { status: 'answered'; count: number } | { status: 'unknown' | 'skipped'; count: null }
);
export interface CountResult extends Omit<SurveyResult, 'scores' | 'closest' | 'farthest'> {
  method: string;
  reasonCode: string | null;
  rankings: { ageGroup: string; label: string; score: number; rank: number; isTied: boolean }[];
  evidenceGroup: AgeGroup | null;
  resultType: { name: string | null; description: string | null; status: string };
  closest: CountEvidence[];
  farthest: CountEvidence[];
  nextAction: { path: '/explore'; label: string; message: string } | null;
}
export interface CountEvidence {
  minorCode: string; name: string; major: string; questionId: string;
  userCount: number; groupValue: number; normalizedDifference: number;
}
export interface ExploreRanking {
  status: 'available' | 'unavailable'; reason: string | null;
  items: { rank: number; minorCode: string; name: string; value: number }[];
}
export interface Evidence {
  minorCode: string; name: string; major: string; userDays: number; groupDays: number;
  userMinutes: number | null; groupMinutes: number | null; differenceDays: number; normalizedDistance: number;
}
export interface SurveyResult {
  status: 'comparable' | 'insufficient'; reason: string | null; month: string;
  comparedCategories: number; minimumCategories: number; answeredCount: number; matches: AgeGroup[];
  scores: { ageGroup: string; label: string; score: number }[];
  closest: Evidence[]; farthest: Evidence[];
  excluded: { minorCode: string; name: string; reason: string }[]; isMock: boolean; source: string;
}
