package kr.ac.hansung.appbti.profile;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ExploreRankingTests {
    private static ExploreRanking.Result rank(boolean weighted, ExploreRanking.Basis basis, String major, Integer limit) {
        return ExploreRanking.rank(RealShapeFixture.profiles(weighted), "20s", "2025-06", basis, major, limit);
    }

    @Test void ageShareIsDefaultAndUsesCompetitionRankOnRoundedTies() {
        var result = rank(false, ExploreRanking.Basis.parse(null), null, null);
        assertEquals("available", result.status());
        assertEquals("ageShare", result.basis());
        assertEquals(List.of("m_b", "m_a", "m_e", "m_c"), result.items().stream().map(ExploreRanking.Item::minorCode).toList());
        // 0.2504와 0.2496은 소수 3자리 0.250으로 같으므로 공동 2위, 다음은 4위다.
        assertEquals(List.of(1, 2, 2, 4), result.items().stream().map(ExploreRanking.Item::rank).toList());
        // 정렬에 쓴 값은 반올림 전 산출물 값 그대로다.
        assertEquals(0.2504, result.items().get(1).value());
    }

    @Test void nullValuesAreExcludedWithReasonInsteadOfZero() {
        var result = rank(false, ExploreRanking.Basis.ageShare, null, null);
        assertTrue(result.items().stream().noneMatch(i -> i.minorCode().equals("m_d")));
        assertEquals(List.of(new ExploreRanking.Excluded("m_d", "가상 쇼핑 B", "share_unavailable")), result.excluded());
        var oldest = ExploreRanking.rank(RealShapeFixture.profiles(false), "60plus", "2025-06", ExploreRanking.Basis.ageShare, null, null);
        assertEquals("missing", oldest.excluded().getFirst().reason());
    }

    @Test void relativeFrequencyIsUnavailableUntilDenominatorIsConfirmed() {
        var result = rank(false, ExploreRanking.Basis.relativeFrequency, null, null);
        assertEquals("unavailable", result.status());
        assertNotNull(result.reason());
        assertTrue(result.items().isEmpty());
        assertTrue(result.excluded().isEmpty());
    }

    @Test void relativeFrequencyRanksProvidedValuesWhenEnabled() {
        var result = rank(true, ExploreRanking.Basis.relativeFrequency, null, null);
        assertEquals("available", result.status());
        assertEquals(List.of("m_b", "m_a", "m_e", "m_c"), result.items().stream().map(ExploreRanking.Item::minorCode).toList());
        assertEquals(1.5, result.items().getFirst().value());
        assertEquals("reference_unavailable", result.excluded().getFirst().reason());
    }

    @Test void majorFilterAndLimitKeepRanks() {
        var shopping = rank(false, ExploreRanking.Basis.ageShare, "쇼핑", null);
        assertEquals(List.of("m_c"), shopping.items().stream().map(ExploreRanking.Item::minorCode).toList());
        assertEquals("쇼핑", shopping.major());
        var top = rank(false, ExploreRanking.Basis.ageShare, null, 2);
        assertEquals(List.of(1, 2), top.items().stream().map(ExploreRanking.Item::rank).toList());
    }

    @Test void sameInputGivesSameResult() {
        assertEquals(rank(false, ExploreRanking.Basis.ageShare, null, null), rank(false, ExploreRanking.Basis.ageShare, null, null));
    }

    @Test void invalidInputsAreRejected() {
        var data = RealShapeFixture.profiles(false);
        assertThrows(IllegalArgumentException.class, () -> ExploreRanking.rank(data, "10s", "2025-06", ExploreRanking.Basis.ageShare, null, null));
        assertThrows(IllegalArgumentException.class, () -> ExploreRanking.rank(data, "20s", "2025-06", ExploreRanking.Basis.ageShare, "없는 대분류", null));
        assertThrows(IllegalArgumentException.class, () -> ExploreRanking.rank(data, "20s", "2025-06", ExploreRanking.Basis.ageShare, null, 0));
        assertThrows(IllegalArgumentException.class, () -> ExploreRanking.Basis.parse("uu"));
    }
}
