package kr.ac.hansung.appbti.similarity;

import kr.ac.hansung.appbti.profile.ProfileData;
import kr.ac.hansung.appbti.survey.SurveyRequest;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class SimilarityCalculatorTests {
    public static ProfileData fixture(boolean timed) {
        var ages = List.of("A", "B", "C", "D", "E", "F").stream().map(id -> new ProfileData.AgeGroup(id, id + "집단")).toList();
        List<ProfileData.Minor> minors = new ArrayList<>();
        List<ProfileData.Row> rows = new ArrayList<>();
        for (int c = 0; c < 6; c++) {
            minors.add(new ProfileData.Minor("c" + c, "가상 " + c, "교육", "가상 설명"));
            for (int a = 0; a < 6; a++) {
                rows.add(new ProfileData.Row("2025-06", ages.get(a).id(), "c" + c, "normal", 100.0,
                        2.0 + a * 4 + c % 2, null, null, null, timed ? 10.0 + a * 10 : null, 0));
            }
        }
        return new ProfileData(new ProfileData.Meta(1, true, "가상 통계", List.of("2025-06"), ages, minors,
                List.of("교육"), new ProfileData.Metrics(timed, timed, false), "users", List.of(), Map.of()), rows);
    }

    public static SimilaritySettings settings(int minimum) {
        return new SimilaritySettings(true, "weighted_absolute_distance", "min_max", Map.of(), minimum, "joint", "exclude", List.of());
    }

    public static SurveyRequest request(double days) {
        return new SurveyRequest("2025-06", java.util.stream.IntStream.range(0, 6)
                .mapToObj(c -> new SurveyRequest.Answer("c" + c, days + c % 2, null)).toList());
    }

    @Test void exactMatchIsDeterministicAndEvidenceDoesNotOverlap() {
        var first = SimilarityCalculator.calculate(fixture(false), settings(4), request(10), "2025-06");
        assertEquals(first, SimilarityCalculator.calculate(fixture(false), settings(4), request(10), "2025-06"));
        assertEquals("C", first.matches().getFirst().id());
        assertEquals(100, first.scores().getFirst().score());
        assertEquals(3, first.closest().size());
        assertEquals(3, first.farthest().size());
        assertTrue(first.closest().stream().noneMatch(e -> first.farthest().stream().anyMatch(f -> f.minorCode().equals(e.minorCode()))));
        assertNull(first.closest().getFirst().groupMinutes());
    }

    @Test void tiesAreJointAndSortedById() {
        var result = SimilarityCalculator.calculate(fixture(false), settings(4), request(8), "2025-06");
        assertEquals(List.of("B", "C"), result.matches().stream().map(ProfileData.AgeGroup::id).toList());
    }

    @Test void missingAgeExcludesCategoryForEveryCandidate() {
        var fixture = fixture(false);
        var incomplete = new ProfileData(fixture.meta(), fixture.profiles().stream().filter(r -> !(r.ageGroup().equals("F") && r.minorCode().equals("c0"))).toList());
        var result = SimilarityCalculator.calculate(incomplete, settings(6), request(10), "2025-06");
        assertEquals("insufficient", result.status());
        assertEquals(5, result.comparedCategories());
        assertTrue(result.scores().isEmpty());
        assertTrue(result.excluded().getFirst().reason().contains("데이터"));
    }

    @Test void zeroAndUnansweredAreDifferentAndExcluded() {
        var answers = new ArrayList<>(request(10).answers());
        answers.set(0, new SurveyRequest.Answer("c0", 0.0, null));
        answers.set(1, new SurveyRequest.Answer("c1", null, null));
        var result = SimilarityCalculator.calculate(fixture(false), settings(4), new SurveyRequest(null, answers), "2025-06");
        assertEquals(4, result.comparedCategories());
        assertEquals(5, result.answeredCount());
        assertTrue(result.excluded().get(0).reason().startsWith("사용 안 함"));
        assertEquals("무응답", result.excluded().get(1).reason());
    }

    @Test void constantRangesAreNotDividedByZero() {
        var fixture = fixture(false);
        var rows = fixture.profiles().stream().map(r -> new ProfileData.Row(r.month(), r.ageGroup(), r.minorCode(), r.status(), r.uu(), 5.0, null, null, null, null, 0)).toList();
        assertEquals("insufficient", SimilarityCalculator.calculate(new ProfileData(fixture.meta(), rows), settings(4), request(10), "2025-06").status());
    }

    @Test void optionalTimeIsComparedOnlyWhenDefinitionsMatch() {
        var answers = request(10).answers().stream().map(a -> new SurveyRequest.Answer(a.minorCode(), a.days(), 30.0)).toList();
        var result = SimilarityCalculator.calculate(fixture(true), settings(4), new SurveyRequest(null, answers), "2025-06");
        assertEquals(30, result.closest().getFirst().groupMinutes());
        assertEquals(100, result.scores().getFirst().score());
        assertNull(SimilarityCalculator.calculate(fixture(false), settings(4), new SurveyRequest(null, answers), "2025-06").closest().getFirst().groupMinutes());
    }

    @Test void invalidAndDuplicateInputsAreRejected() {
        for (double value : List.of(-1.0, 31.0, Double.NaN, Double.POSITIVE_INFINITY)) {
            assertThrows(IllegalArgumentException.class, () -> SimilarityCalculator.calculate(fixture(false), settings(4), request(value), "2025-06"));
        }
        var answer = new SurveyRequest.Answer("c0", 5.0, null);
        assertThrows(IllegalArgumentException.class, () -> SimilarityCalculator.calculate(fixture(false), settings(4), new SurveyRequest(null, List.of(answer, answer)), "2025-06"));
    }

    @Test void disabledActualSettingsReturnNoScore() {
        var disabled = new SimilaritySettings(false, null, null, Map.of(), null, null, null, List.of());
        assertEquals("insufficient", SimilarityCalculator.calculate(fixture(false), disabled, request(10), "2025-06").status());
    }
}
