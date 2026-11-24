package kr.ac.hansung.appbti.profile;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 이 달의 특이 신호 필터·정렬(docs/API.md 5장, 기능은 꺼 둠). 신호 값은 직접 만든 가상 값이다. */
class ExploreSignalsTests {
    // 가상 신호가 들어 있는 산출물을 만든다.
    static ProfileData data(boolean dailyTime, boolean withSignals) {
        var ages = List.of(new ProfileData.AgeGroup("under20", "20대 미만"), new ProfileData.AgeGroup("20s", "20대"), new ProfileData.AgeGroup("30s", "30대"),
                new ProfileData.AgeGroup("40s", "40대"), new ProfileData.AgeGroup("50s", "50대"), new ProfileData.AgeGroup("60plus", "60대 이상"));
        var minors = List.of(new ProfileData.Minor("aaa", "가", "금융", null), new ProfileData.Minor("bbb", "나", "가족", null),
                new ProfileData.Minor("ccc", "다", "가족", null));
        var meta = new ProfileData.Meta(1, false, "가상 통계", List.of("2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"), ages, minors,
                List.of("금융", "가족"), new ProfileData.Metrics(dailyTime, false, false), null, List.of(), Map.of());
        var items = List.of(
                new ProfileData.Signal("2025-04", "50s", "bbb", "days", "up", 1.38, 3.6, "generation", false),
                new ProfileData.Signal("2025-04", "50s", "aaa", "days", "up", 1.62, 4.1, "market", false),
                new ProfileData.Signal("2025-04", "20s", "aaa", "days", "up", 1.70, 4.1, "market", false),
                new ProfileData.Signal("2025-04", "30s", "ccc", "time", "down", 0.70, 3.6, "generation", false),
                new ProfileData.Signal("2025-06", "40s", "ccc", "days", "up", 1.55, 5.0, "generation", true));
        var signals = new ProfileData.MonthlySignals("draft", new ProfileData.SignalRule(1.25, 3.0, 1.25, 0.02, 1.5, "stricter_and_flag"), items);
        return new ProfileData(meta, List.of(), null, withSignals ? signals : null);
    }

    @Test void sortsByZThenChangeSizeThenCodeWithCompetitionRank() {
        var result = ExploreSignals.find(data(true, true), "2025-04", null, null, null, null, null);
        assertEquals("available", result.status());
        assertEquals(List.of("aaa:20s", "aaa:50s", "ccc:30s", "bbb:50s"), result.signals().stream().map(s -> s.minorCode() + ":" + s.ageGroup().id()).toList());
        assertEquals(List.of(1, 1, 3, 3), result.signals().stream().map(ExploreSignals.Item::rank).toList());
        assertEquals("금융", result.signals().getFirst().major());
        assertFalse(result.isEdgeMonth());
        assertNull(result.message());
        assertEquals(new ExploreSignals.Rule(1.25, 3.0), result.rule());
    }

    @Test void filtersByAgeTypeMetricMajorAndLimit() {
        var data = data(true, true);
        assertEquals(List.of("aaa", "bbb"), ExploreSignals.find(data, "2025-04", "50s", null, null, null, null).signals().stream().map(ExploreSignals.Item::minorCode).toList());
        assertEquals("50대", ExploreSignals.find(data, "2025-04", "50s", null, null, null, null).ageGroup().label());
        assertTrue(ExploreSignals.find(data, "2025-04", null, "generation", null, null, null).signals().stream().allMatch(s -> s.type().equals("generation")));
        assertEquals(List.of("ccc"), ExploreSignals.find(data, "2025-04", null, null, "time", null, null).signals().stream().map(ExploreSignals.Item::minorCode).toList());
        assertTrue(ExploreSignals.find(data, "2025-04", null, null, null, "가족", null).signals().stream().allMatch(s -> s.major().equals("가족")));
        assertEquals(2, ExploreSignals.find(data, "2025-04", null, null, null, null, 2).signals().size());
    }

    @Test void edgeMonthEmptyMonthUnavailableAndTimeWithoutMetric() {
        assertTrue(ExploreSignals.find(data(true, true), "2025-06", null, null, null, null, null).isEdgeMonth());
        var empty = ExploreSignals.find(data(true, true), "2025-03", null, null, null, null, null);
        assertTrue(empty.signals().isEmpty());
        assertEquals("평소와 비슷한 달이에요", empty.message());
        var unavailable = ExploreSignals.find(data(true, false), "2025-04", null, null, null, null, null);
        assertEquals("unavailable", unavailable.status());
        assertTrue(unavailable.signals().isEmpty());
        assertTrue(ExploreSignals.find(data(false, true), "2025-04", null, null, null, null, null).signals().stream().noneMatch(s -> s.metric().equals("time")));
    }

    @Test void invalidFiltersHaveCodes() {
        var data = data(true, true);
        assertEquals("INVALID_AGE_GROUP", assertThrows(ApiException.class, () -> ExploreSignals.find(data, "2025-04", "10s", null, null, null, null)).code());
        assertEquals("INVALID_TYPE", assertThrows(ApiException.class, () -> ExploreSignals.find(data, "2025-04", null, "trend", null, null, null)).code());
        assertEquals("INVALID_METRIC", assertThrows(ApiException.class, () -> ExploreSignals.find(data, "2025-04", null, null, "uu", null, null)).code());
        assertEquals("INVALID_MAJOR", assertThrows(ApiException.class, () -> ExploreSignals.find(data, "2025-04", null, null, null, "없음", null)).code());
        assertEquals("INVALID_LIMIT", assertThrows(ApiException.class, () -> ExploreSignals.find(data, "2025-04", null, null, null, null, 0)).code());
    }
}
