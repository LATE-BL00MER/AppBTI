package kr.ac.hansung.appbti.profile;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 실제 산출물과 같은 구조(제공 6구간 ID·라벨, 여러 대분류, 일부 null)의 가상 fixture.
 * 모든 수치는 직접 만든 가상 값이며 LG U+ 제공 수치가 아니다.
 */
public final class RealShapeFixture {
    private RealShapeFixture() {}

    static final List<ProfileData.AgeGroup> AGES = List.of(
            new ProfileData.AgeGroup("under20", "20대 미만"), new ProfileData.AgeGroup("20s", "20대"),
            new ProfileData.AgeGroup("30s", "30대"), new ProfileData.AgeGroup("40s", "40대"),
            new ProfileData.AgeGroup("50s", "50대"), new ProfileData.AgeGroup("60plus", "60대 이상"));

    /** 20s 기준 ageShare: m_b 0.300 → m_a 0.2504·m_e 0.2496(반올림 0.250 동점) → m_c 0.100. m_d는 60plus 결측이라 전 연령 null. */
    public static ProfileData profiles(boolean weightedReference) {
        var minors = List.of(
                new ProfileData.Minor("m_a", "가상 엔터 A", "엔터테인먼트", null),
                new ProfileData.Minor("m_b", "가상 엔터 B", "엔터테인먼트", null),
                new ProfileData.Minor("m_c", "가상 쇼핑 A", "쇼핑", null),
                new ProfileData.Minor("m_d", "가상 쇼핑 B", "쇼핑", null),
                new ProfileData.Minor("m_e", "가상 금융 A", "금융/재테크", null));
        List<ProfileData.Row> rows = new ArrayList<>();
        for (String month : List.of("2025-05", "2025-06")) {
            for (var age : AGES) {
                rows.add(row(month, age.id(), "m_a", age.id().equals("20s") ? 0.2504 : 0.1499, 10.0, weightedReference ? 1.25 : null));
                rows.add(row(month, age.id(), "m_b", age.id().equals("20s") ? 0.3 : 0.14, 8.0, weightedReference ? 1.5 : null));
                rows.add(row(month, age.id(), "m_c", age.id().equals("20s") ? 0.1 : 0.18, 4.0, weightedReference ? 0.8 : null));
                rows.add(age.id().equals("60plus")
                        ? new ProfileData.Row(month, age.id(), "m_d", "missing", null, null, null, null, null, null, 0)
                        : new ProfileData.Row(month, age.id(), "m_d", "normal", 1000.0, 3.0, null, null, null, null, 0));
                rows.add(row(month, age.id(), "m_e", age.id().equals("20s") ? 0.2496 : 0.15, 5.0, weightedReference ? 1.2 : null));
            }
        }
        var meta = new ProfileData.Meta(1, false, "가상 테스트 출처", List.of("2025-05", "2025-06"), AGES, minors,
                List.of("가족", "건강", "교육", "금융/재테크", "뉴스/정보", "쇼핑", "스포츠/여가",
                        "식품", "엔터테인먼트", "여행", "온라인서비스", "의류/패션", "자동차", "주거/홈케어"),
                new ProfileData.Metrics(false, false, weightedReference), weightedReference ? "users" : null,
                List.of(), Map.of("rowCount", rows.size(), "warningCount", 0));
        return new ProfileData(meta, rows);
    }

    private static ProfileData.Row row(String month, String age, String minor, double share, double days, Double relative) {
        return new ProfileData.Row(month, age, minor, "normal", 1000.0, days, share,
                relative == null ? null : days / relative, relative, null, 0);
    }
}
