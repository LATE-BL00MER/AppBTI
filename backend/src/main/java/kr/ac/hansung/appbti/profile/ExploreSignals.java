package kr.ac.hansung.appbti.profile;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 이 달의 특이 신호(API v2 5장). 파이프라인이 판정한 신호를 필터·정렬만 하고 다시 계산하지 않는다. */
public final class ExploreSignals {
    private ExploreSignals() {}

    public record Rule(double minRatio, double minZ) {}
    public record Item(int rank, String minorCode, String name, String major, String metric, String direction,
                       double ratio, double z, String type, ProfileData.AgeGroup ageGroup) {}
    public record Result(String status, String month, ProfileData.AgeGroup ageGroup, boolean isEdgeMonth, Rule rule,
                         List<Item> signals, String message, boolean isMock, String source) {}

    private static final Set<String> TYPES = Set.of("market", "generation");
    private static final Set<String> METRICS = Set.of("days", "time");

    // 월·연령대·유형·지표·대분류로 신호를 고르고 z 내림차순 경쟁 순위를 매긴다.
    public static Result find(ProfileData data, String month, String ageGroupId, String type, String metric, String major, Integer limit) {
        var meta = data.meta();
        ProfileData.AgeGroup ageGroup = ageGroupId == null ? null : meta.ageGroups().stream().filter(a -> a.id().equals(ageGroupId)).findFirst()
                .orElseThrow(() -> ApiException.badRequest("INVALID_AGE_GROUP", "제공하지 않는 연령대입니다."));
        if (type != null && !TYPES.contains(type)) throw ApiException.badRequest("INVALID_TYPE", "type은 market 또는 generation이어야 합니다.");
        if (metric != null && !METRICS.contains(metric)) throw ApiException.badRequest("INVALID_METRIC", "metric은 days 또는 time이어야 합니다.");
        if (major != null && !meta.majorCategories().contains(major)) throw ApiException.badRequest("INVALID_MAJOR", "제공하지 않는 대분류입니다.");
        if (limit != null && limit < 1) throw ApiException.badRequest("INVALID_LIMIT", "limit은 1 이상 정수여야 합니다.");
        boolean edge = month.equals(meta.months().getFirst()) || month.equals(meta.latestMonth());
        var signals = data.monthlySignals();
        if (signals == null) {
            return new Result("unavailable", month, ageGroup, edge, null, List.of(), "특이 신호를 준비하지 못했어요.", meta.isMock(), meta.source());
        }

        Map<String, ProfileData.Minor> minors = meta.minorCategories().stream().collect(Collectors.toMap(ProfileData.Minor::code, Function.identity()));
        Map<String, ProfileData.AgeGroup> ages = meta.ageGroups().stream().collect(Collectors.toMap(ProfileData.AgeGroup::id, Function.identity()));
        List<String> ageOrder = meta.ageGroups().stream().map(ProfileData.AgeGroup::id).toList();
        List<ProfileData.Signal> selected = signals.items().stream()
                .filter(s -> s.month().equals(month) && minors.containsKey(s.minorCode()) && ages.containsKey(s.ageGroup()))
                .filter(s -> ageGroupId == null || s.ageGroup().equals(ageGroupId))
                .filter(s -> type == null || s.type().equals(type))
                .filter(s -> metric == null || s.metric().equals(metric))
                .filter(s -> major == null || major.equals(minors.get(s.minorCode()).major()))
                .filter(s -> !"time".equals(s.metric()) || meta.metrics().dailyTime())
                .sorted(Comparator.comparingDouble(ProfileData.Signal::z).reversed()
                        .thenComparing(Comparator.comparingDouble((ProfileData.Signal s) -> Math.abs(Math.log(s.ratio()))).reversed())
                        .thenComparing(ProfileData.Signal::minorCode)
                        .thenComparingInt(s -> ageOrder.indexOf(s.ageGroup()))
                        .thenComparing(ProfileData.Signal::metric))
                .toList();

        List<Item> items = new ArrayList<>();
        for (int i = 0; i < selected.size() && (limit == null || i < limit); i++) {
            var s = selected.get(i);
            int rank = i > 0 && selected.get(i - 1).z() == s.z() ? items.get(i - 1).rank() : i + 1;
            var minor = minors.get(s.minorCode());
            items.add(new Item(rank, s.minorCode(), minor.name(), minor.major(), s.metric(), s.direction(), s.ratio(), s.z(), s.type(), ages.get(s.ageGroup())));
        }
        return new Result("available", month, ageGroup, edge, new Rule(signals.rule().minRatio(), signals.rule().minZ()), items,
                items.isEmpty() ? "평소와 비슷한 달이에요" : null, meta.isMock(), meta.source());
    }
}
