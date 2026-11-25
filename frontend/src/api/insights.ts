export type Age = { id: string; label: string };
type Insight<T> = { headline: string; method_note: string; chart_data: T };
type Category = { minor_code: string; minor_name: string; major: string };
type SwitchingCategory = Category & { quadrant_count: number };
export type Spotlight = { age_group: string; minor_code?: string; headline?: string };
export type OverviewMetric = 'days' | 'minutes';
type OverviewHighlight = Category & { leaders: string[]; max: number; gap: number };
export interface HomeOverviewData {
  month: string;
  services: (Category & Record<OverviewMetric, Record<string, number | null>> & { days_leaders: string[]; minutes_leaders: string[] })[];
  highlights: Record<OverviewMetric, { largest: OverviewHighlight | null; smallest: OverviewHighlight | null }>;
  top_users: (Category & { total: number })[];
}
type Closest = { age_group: string; closest_age: string; second_age: string; near_tie: boolean };
export type AdjacentGap = { left: string; right: string; distance: number };
export type AgeMap = { age_order: string[]; distance_matrix: number[][] | null; nearest: Closest[]; category_count: number;
  adjacent?: AdjacentGap[]; largest_adjacent_gap?: AdjacentGap | null };

export interface InsightsDocument {
  schema_version: number;
  is_mock: boolean;
  months: string[];
  age_groups: Age[];
  overview: HomeOverviewData;
  spotlights: Record<keyof InsightsDocument['insights'], Spotlight | null>;
  composition_index: { reference: { name: string }; points: { month: string; minor_code: string; age_group: string; index: number | null }[] } | null;
  insights: {
    generation_map: Insight<AgeMap>;
    frequency_duration: Insight<{
      thresholds: Record<string, { days: number; minutes: number }>;
      band: number;
      switching_count: number;
      points: (Category & { age_group: string; days: number; minutes: number; days_level: number; time_level: number;
        quadrant: string; common_months: string[] })[];
      switching?: SwitchingCategory[];
      top_switching: SwitchingCategory[];
    }>;
    common_signature: Insight<{
      signatures: Record<string, (Category & { age_group: string; multiplier: number; days_multiplier: number; time_multiplier: number })[]>;
      common: (Category & { clr_stddev: number })[];
      points: (Category & { age_group: string; multiplier: number; days_multiplier: number; time_multiplier: number })[];
      major_summary: { age_group: string; major: string; regular: number | null; all: number }[];
      monthly_points?: { month: string; minor_code: string; age_group: string; days_multiplier: number; time_multiplier: number }[];
    }>;
  };
}

export const insightSections = [
  { id: 'generation_map', title: '연령대 지도' },
  { id: 'frequency_duration', title: '자주 쓰기와 오래 쓰기' },
  { id: 'common_signature', title: '공통 서비스와 연령대별 특징' },
] as const;

export function matchesInsights(document: InsightsDocument, meta: { isMock: boolean; months: string[]; ageGroups: Age[] }) {
  return document.schema_version === 2 && document.is_mock === meta.isMock && document.months.join(',') === meta.months.join(',')
    && document.age_groups.map(age => age.id).join(',') === meta.ageGroups.map(age => age.id).join(',');
}
