package kr.ac.hansung.appbti.profile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 세대별 탐색 랭킹. Python 산출물 값을 필터·정렬만 하고 지표를 다시 계산하지 않는다. */
public final class ExploreRanking {
    private ExploreRanking() {}

    /** 정렬 기준과 동점 판정에 쓰는 반올림 자릿수(API.md 3-3). */
    public enum Basis {
        ageShare(3), relativeFrequency(2);
        final int scale;
        Basis(int scale) { this.scale = scale; }

        Double of(ProfileData.Row row) { return this == ageShare ? row.ageShare() : row.relativeFrequency(); }

        public static Basis parse(String value) {
            if (value == null) return ageShare;
            for (Basis basis : values()) if (basis.name().equals(value)) return basis;
            throw new IllegalArgumentException("basis는 ageShare 또는 relativeFrequency여야 합니다.");
        }
    }

    public record Item(int rank, String minorCode, String name, String major, double value, Double ageShare,
                       Double avgDays, Double referenceDays, Double relativeFrequency) {}
    public record Excluded(String minorCode, String name, String reason) {}
    public record Result(String status, String reason, String month, ProfileData.AgeGroup ageGroup, String major,
                         String basis, boolean isMock, String source, List<Item> items, List<Excluded> excluded) {}

    public static Result rank(ProfileData data, String ageGroupId, String month, Basis basis, String major, Integer limit) {
        var meta = data.meta();
        var ageGroup = meta.ageGroups().stream().filter(a -> a.id().equals(ageGroupId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("제공하지 않는 연령대입니다."));
        if (major != null && !meta.majorCategories().contains(major)) throw new IllegalArgumentException("제공하지 않는 대분류입니다.");
        if (limit != null && limit < 1) throw new IllegalArgumentException("limit은 1 이상 정수여야 합니다.");
        if (basis == Basis.relativeFrequency && !meta.metrics().weightedReference()) {
            return new Result("unavailable", "평균 이용일수의 분모가 확인되지 않아 기준값 대비 비교를 제공하지 않습니다. basis=ageShare로 볼 수 있어요.",
                    month, ageGroup, major, basis.name(), meta.isMock(), meta.source(), List.of(), List.of());
        }

        Map<String, ProfileData.Row> rows = data.profiles().stream()
                .filter(r -> r.month().equals(month) && r.ageGroup().equals(ageGroupId))
                .collect(Collectors.toMap(ProfileData.Row::minorCode, Function.identity(), (first, second) -> first));
        List<Ranked> ranked = new ArrayList<>();
        List<Excluded> excluded = new ArrayList<>();
        for (var minor : meta.minorCategories()) {
            if (major != null && !major.equals(minor.major())) continue;
            var row = rows.get(minor.code());
            Double value = row == null ? null : basis.of(row);
            // 결측은 0으로 순위에 넣지 않고 사유와 함께 따로 돌려준다.
            if (value == null) excluded.add(new Excluded(minor.code(), minor.name(), reason(row, basis)));
            else ranked.add(new Ranked(minor, row, value, BigDecimal.valueOf(value).setScale(basis.scale, RoundingMode.HALF_UP)));
        }
        ranked.sort(Comparator.comparing(Ranked::rounded).reversed().thenComparing(r -> r.minor().code()));
        excluded.sort(Comparator.comparing(Excluded::minorCode));

        List<Item> items = new ArrayList<>();
        for (int i = 0; i < ranked.size() && (limit == null || i < limit); i++) {
            var current = ranked.get(i);
            // 경쟁 순위: 화면에 보이는 반올림 값이 같으면 같은 순위, 다음 순위는 건너뛴다(1, 2, 2, 4).
            int rank = i > 0 && ranked.get(i - 1).rounded().compareTo(current.rounded()) == 0 ? items.get(i - 1).rank() : i + 1;
            var row = current.row();
            items.add(new Item(rank, current.minor().code(), current.minor().name(), current.minor().major(), current.value(),
                    row.ageShare(), row.avgDays(), row.referenceDays(), row.relativeFrequency()));
        }
        return new Result("available", null, month, ageGroup, major, basis.name(), meta.isMock(), meta.source(), items, excluded);
    }

    private static String reason(ProfileData.Row row, Basis basis) {
        if (row == null) return "missing";
        if (!"normal".equals(row.status())) return row.status();
        // 행은 정상이지만 다른 연령대 결측 등으로 비교 기준을 만들 수 없는 경우.
        return basis == Basis.relativeFrequency ? "reference_unavailable" : "share_unavailable";
    }

    private record Ranked(ProfileData.Minor minor, ProfileData.Row row, double value, BigDecimal rounded) {}
}
