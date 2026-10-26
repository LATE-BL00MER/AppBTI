package kr.ac.hansung.appbti.profile;

import java.util.List;
import java.util.Map;

/** Python 산출물 계약. 집단 지표를 Java에서 다시 계산하지 않는다. */
public record ProfileData(Meta meta, List<Row> profiles) {
    public record AgeGroup(String id, String label) {}
    public record Minor(String code, String name, String major, String description) {}
    public record Metrics(boolean dailyTime, boolean timeComparable, boolean weightedReference) {}
    public record Meta(int schemaVersion, boolean isMock, String source, List<String> months,
                       List<AgeGroup> ageGroups, List<Minor> minorCategories, List<String> majorCategories,
                       Metrics metrics, String avgDaysDenominator, List<String> continuityBreaks,
                       Map<String, Integer> quality) {
        public String latestMonth() { return months.getLast(); }
    }
    public record Row(String month, String ageGroup, String minorCode, String status, Double uu,
                      Double avgDays, Double ageShare, Double referenceDays, Double relativeFrequency,
                      Double avgDailyTime, int segment) {}
}
