package kr.ac.hansung.appbti.profile;

import java.util.List;
import java.util.Map;

/** Python 산출물 계약. 집단 지표를 Java에서 다시 계산하지 않는다. */
public record ProfileData(Meta meta, List<Row> profiles, SurveyReference surveyReference, MonthlySignals monthlySignals) {
    public record AgeGroup(String id, String label) {}
    public record Minor(String code, String name, String major, String description) {}
    public record Metrics(boolean dailyTime, boolean timeComparable, boolean weightedReference) {}
    public record Meta(int schemaVersion, boolean isMock, String source, List<String> months,
                       List<AgeGroup> ageGroups, List<Minor> minorCategories, List<String> majorCategories,
                       Metrics metrics, String avgDaysDenominator, List<String> continuityBreaks,
                       Map<String, Integer> quality) {
        // 가장 최근 기준월을 돌려준다.
        public String latestMonth() { return months.getLast(); }
    }
    public record Row(String month, String ageGroup, String minorCode, String status, Double uu,
                      Double avgDays, Double ageShare, Double referenceDays, Double relativeFrequency,
                      Double avgDailyTime, int segment) {}

    public record ReferenceValue(Double logMean, Double display) {}
    public record ReferenceItem(String minorCode, String metric, Map<String, ReferenceValue> values) {}
    public record SurveyReference(List<String> months, List<ReferenceItem> items) {
        // 중분류·지표에 맞는 매칭 기준값을 찾는다. 없으면 null.
        public ReferenceItem find(String minorCode, String metric) {
            return items.stream().filter(i -> i.minorCode().equals(minorCode) && i.metric().equals(metric)).findFirst().orElse(null);
        }
    }

    public record SignalRule(double minRatio, double minZ, Double generationMinRatio, Double minStd, Double edgeMinRatio, String edgeMonthPolicy) {}
    public record Signal(String month, String ageGroup, String minorCode, String metric, String direction,
                         double ratio, double z, String type, boolean isEdgeMonth) {}
    public record MonthlySignals(String status, SignalRule rule, List<Signal> items) {}

    // 설문 기준값·특이 신호가 없는 산출물(v1·테스트 고정값)을 만든다.
    public ProfileData(Meta meta, List<Row> profiles) { this(meta, profiles, null, null); }
}
