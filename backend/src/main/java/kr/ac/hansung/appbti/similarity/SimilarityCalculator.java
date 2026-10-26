package kr.ac.hansung.appbti.similarity;

import kr.ac.hansung.appbti.profile.ProfileData;
import kr.ac.hansung.appbti.survey.SurveyRequest;

import java.time.YearMonth;
import java.util.*;

/** 결정적 순수 함수. 응답과 전체 비교 집단에 공통된 항목만 같은 척도로 비교한다. */
public final class SimilarityCalculator {
    private SimilarityCalculator() {}
    public record Excluded(String minorCode, String name, String reason) {}
    public record Evidence(String minorCode, String name, String major, double userDays, double groupDays,
                           Double userMinutes, Double groupMinutes, double differenceDays, double normalizedDistance) {}
    public record Score(String ageGroup, String label, double score) {}
    public record Result(String status, String reason, String month, int comparedCategories, int minimumCategories,
                         int answeredCount, List<ProfileData.AgeGroup> matches, List<Score> scores,
                         List<Evidence> closest, List<Evidence> farthest, List<Excluded> excluded,
                         boolean isMock, String source) {}
    private record Feature(ProfileData.Minor minor, SurveyRequest.Answer answer,
                           Map<String, ProfileData.Row> rows, double dayRange, double timeRange, double weight) {}
    private record Ranked(ProfileData.AgeGroup age, double distance, List<Evidence> evidence) {}

    public static Result calculate(ProfileData data, SimilaritySettings settings, SurveyRequest request, String month) {
        var meta = data.meta();
        Map<String, ProfileData.Minor> minors = new LinkedHashMap<>();
        meta.minorCategories().forEach(m -> minors.put(m.code(), m));
        if (request.answers() == null || request.answers().size() > minors.size()) throw new IllegalArgumentException("설문 응답 목록이 올바르지 않습니다.");
        Map<String, SurveyRequest.Answer> answers = new LinkedHashMap<>();
        int maxDays = YearMonth.parse(month).lengthOfMonth();
        for (var answer : request.answers()) {
            if (answer == null || !minors.containsKey(answer.minorCode()) || answers.putIfAbsent(answer.minorCode(), answer) != null) {
                throw new IllegalArgumentException("중복되거나 알 수 없는 설문 문항입니다.");
            }
            if (answer.days() != null && (!Double.isFinite(answer.days()) || answer.days() < 0 || answer.days() > maxDays)) {
                throw new IllegalArgumentException("응답 일수는 해당 월의 0~" + maxDays + "일이어야 합니다.");
            }
            if (answer.minutes() != null && (!Double.isFinite(answer.minutes()) || answer.minutes() < 0 || answer.minutes() > 1440)) {
                throw new IllegalArgumentException("응답 시간은 0~1440분이어야 합니다.");
            }
        }
        int answered = (int) answers.values().stream().filter(a -> a.days() != null).count();
        int minimum = settings.minimum_categories() == null ? minors.size() : settings.minimum_categories();
        if (!settings.enabled()) return unavailable(data, month, minimum, answered, List.of(), "비교 방식이 아직 확정되지 않았습니다. 집단별 탐색을 이용해 주세요.");
        if (!"weighted_absolute_distance".equals(settings.method()) || !"min_max".equals(settings.normalization())
                || !"joint".equals(settings.tie_policy()) || !Set.of("exclude", "include").contains(settings.zero_days_policy())
                || minimum < 1) throw new IllegalArgumentException("지원하지 않는 유사도 설정입니다.");
        Map<String, Map<String, ProfileData.Row>> byCategory = new HashMap<>();
        data.profiles().stream().filter(r -> r.month().equals(month)).forEach(r ->
                byCategory.computeIfAbsent(r.minorCode(), key -> new HashMap<>()).put(r.ageGroup(), r));
        List<Feature> features = new ArrayList<>();
        List<Excluded> excluded = new ArrayList<>();
        for (var minor : minors.values()) {
            var answer = answers.get(minor.code());
            if (answer == null || answer.days() == null) {
                excluded.add(new Excluded(minor.code(), minor.name(), "무응답"));
                continue;
            }
            // TODO(확인 필요): 실제 평균 이용일수 분모 및 0일 응답 정책. 목업은 이용자 기준으로 제외한다.
            if (answer.days() == 0 && "exclude".equals(settings.zero_days_policy())) {
                excluded.add(new Excluded(minor.code(), minor.name(), "사용 안 함: 이용자 기준 평균과 직접 비교하지 않음"));
                continue;
            }
            var group = byCategory.getOrDefault(minor.code(), Map.of());
            boolean complete = meta.ageGroups().stream().allMatch(a -> group.containsKey(a.id()) && group.get(a.id()).avgDays() != null && "normal".equals(group.get(a.id()).status()));
            if (!complete) {
                excluded.add(new Excluded(minor.code(), minor.name(), "비교 집단 중 데이터 없음"));
                continue;
            }
            double dayRange = range(group.values().stream().map(ProfileData.Row::avgDays).toList());
            boolean compareTime = meta.metrics().timeComparable() && answer.minutes() != null && answer.days() > 0
                    && meta.ageGroups().stream().allMatch(a -> group.get(a.id()).avgDailyTime() != null);
            double timeRange = compareTime ? range(group.values().stream().map(ProfileData.Row::avgDailyTime).toList()) : 0;
            Double weight = settings.weights().getOrDefault(minor.code(), 1.0);
            if (weight == null || !Double.isFinite(weight) || weight < 0) throw new IllegalArgumentException("유사도 가중치가 올바르지 않습니다.");
            if ((dayRange == 0 && timeRange == 0) || weight == 0) {
                excluded.add(new Excluded(minor.code(), minor.name(), "집단 차이가 없거나 가중치가 0인 항목"));
                continue;
            }
            features.add(new Feature(minor, answer, group, dayRange, timeRange, weight));
        }
        if (features.size() < minimum) return unavailable(data, month, minimum, answered, excluded, "비교 가능한 항목이 " + features.size() + "개입니다. " + minimum + "개 이상 필요합니다.", features.size());
        List<Ranked> ranking = new ArrayList<>();
        for (var age : meta.ageGroups()) {
            List<Evidence> evidence = new ArrayList<>();
            double weighted = 0, totalWeight = 0;
            for (var feature : features) {
                var row = feature.rows().get(age.id());
                double difference = Math.abs(feature.answer().days() - row.avgDays());
                double distance = feature.dayRange() > 0 ? Math.min(1, difference / feature.dayRange()) : 0;
                int dimensions = feature.dayRange() > 0 ? 1 : 0;
                if (feature.timeRange() > 0) {
                    distance += Math.min(1, Math.abs(feature.answer().minutes() - row.avgDailyTime()) / feature.timeRange());
                    dimensions++;
                }
                distance /= dimensions;
                weighted += distance * feature.weight();
                totalWeight += feature.weight();
                evidence.add(new Evidence(feature.minor().code(), feature.minor().name(), feature.minor().major(),
                        feature.answer().days(), row.avgDays(), feature.timeRange() > 0 ? feature.answer().minutes() : null,
                        feature.timeRange() > 0 ? row.avgDailyTime() : null, difference, distance));
            }
            ranking.add(new Ranked(age, weighted / totalWeight, evidence));
        }
        ranking.sort(Comparator.comparingDouble(Ranked::distance).thenComparing(r -> r.age().id()));
        var best = ranking.getFirst();
        var matches = ranking.stream().filter(r -> Math.abs(r.distance() - best.distance()) < 1e-9).map(Ranked::age).toList();
        var scores = ranking.stream().map(r -> new Score(r.age().id(), r.age().label(), Math.round(1000 * (1 - r.distance())) / 10.0)).toList();
        var sorted = best.evidence().stream().sorted(Comparator.comparingDouble(Evidence::normalizedDistance).thenComparing(Evidence::minorCode)).toList();
        var closest = sorted.stream().limit(3).toList();
        var closeCodes = closest.stream().map(Evidence::minorCode).toList();
        var farthest = sorted.stream().filter(e -> !closeCodes.contains(e.minorCode())).sorted(Comparator.comparingDouble(Evidence::normalizedDistance).reversed().thenComparing(Evidence::minorCode)).limit(3).toList();
        return new Result("comparable", null, month, features.size(), minimum, answered, matches, scores, closest, farthest, excluded, meta.isMock(), meta.source());
    }

    private static double range(List<Double> values) { return Collections.max(values) - Collections.min(values); }
    private static Result unavailable(ProfileData data, String month, int minimum, int answered, List<Excluded> excluded, String reason) {
        return unavailable(data, month, minimum, answered, excluded, reason, 0);
    }
    private static Result unavailable(ProfileData data, String month, int minimum, int answered, List<Excluded> excluded, String reason, int count) {
        return new Result("insufficient", reason, month, count, minimum, answered, List.of(), List.of(), List.of(), List.of(), excluded, data.meta().isMock(), data.meta().source());
    }
}
