package kr.ac.hansung.appbti.profile;

import java.util.List;
import java.util.Map;

/** Python 산출물 계약. 집단 지표를 Java에서 다시 계산하지 않는다. */
public record ProfileData(Meta meta, List<Row> profiles, SurveyReference surveyReference, MonthlySignals monthlySignals) {
    public ProfileData(Meta meta, List<Row> profiles) { this(meta, profiles, null, null); }
    public record AgeGroup(String id, String label) {}
    public record Minor(String code, String name, String major, String description) {}
    public record Metrics(boolean dailyTime, boolean timeComparable, boolean weightedReference) {}
    public record CompositionIndexReference(String minorCode, String name) {}
    public record Meta(int schemaVersion, boolean isMock, String source, List<String> months,
                       List<AgeGroup> ageGroups, List<Minor> minorCategories, List<String> majorCategories,
                       Metrics metrics, String avgDaysDenominator, List<String> continuityBreaks,
                       Map<String, Integer> quality, CompositionIndexReference compositionIndexReference) {
        public Meta(int schemaVersion, boolean isMock, String source, List<String> months, List<AgeGroup> ageGroups,
                    List<Minor> minorCategories, List<String> majorCategories, Metrics metrics,
                    String avgDaysDenominator, List<String> continuityBreaks, Map<String, Integer> quality) {
            this(schemaVersion, isMock, source, months, ageGroups, minorCategories, majorCategories,
                    metrics, avgDaysDenominator, continuityBreaks, quality, null);
        }
        public String latestMonth() { return months.getLast(); }
    }
    public record Row(String month, String ageGroup, String minorCode, String status, Double uu,
                      Double avgDays, Double ageShare, Double referenceDays, Double relativeFrequency,
                      Double avgDailyTime, int segment, Double ageShareIndex,
                      Double ageRelativeDays, Double ageRelativeTime, Boolean representativeEligible) {
        public Row(String month, String ageGroup, String minorCode, String status, Double uu,
                   Double avgDays, Double ageShare, Double referenceDays, Double relativeFrequency,
                   Double avgDailyTime, int segment) {
            this(month, ageGroup, minorCode, status, uu, avgDays, ageShare, referenceDays,
                    relativeFrequency, avgDailyTime, segment, null, null, null, null);
        }
    }

    public record ReferenceValue(Double logMean, Double display) {}
    public record ReferenceItem(String minorCode, String metric, Map<String, ReferenceValue> values) {}
    public record SurveyReference(List<String> months, List<ReferenceItem> items, String timeBasis) {
        public SurveyReference(List<String> months, List<ReferenceItem> items) { this(months, items, "used_days"); }

        public ReferenceItem find(String minorCode, String metric) {
            return items.stream().filter(i -> i.minorCode().equals(minorCode) && i.metric().equals(metric)).findFirst().orElse(null);
        }
    }

    public record SignalRule(double minRatio, double minZ, Double generationMinRatio, Double minStd, Double edgeMinRatio, String edgeMonthPolicy) {}
    public record Signal(String month, String ageGroup, String minorCode, String metric, String direction,
                         double ratio, double z, String type, boolean isEdgeMonth) {}
    public record MonthlySignals(String status, SignalRule rule, List<Signal> items) {}
}
