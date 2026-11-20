package kr.ac.hansung.appbti.similarity;

import kr.ac.hansung.appbti.profile.ApiException;
import kr.ac.hansung.appbti.profile.ProfileData;
import kr.ac.hansung.appbti.survey.SurveyQuestions;
import kr.ac.hansung.appbti.survey.SurveyRequest;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.function.BiFunction;

import static org.junit.jupiter.api.Assertions.*;

/** API v2 설문 매칭·또래 비교(docs/API_v2_draft.md 6장). 모든 값은 직접 만든 가상 값이고, 기대값은 Python으로 따로 계산했다. */
public class ClrMatcherTests {
    static final List<String> AGES = List.of("under20", "20s", "30s", "40s", "50s", "60plus");
    static final String[][] QUESTIONS = {{"q01", "weather", "days"}, {"q02", "portal", "days"}, {"q03", "webtoon", "days"}, {"q04", "game", "days"},
            {"q05", "portal", "time"}, {"q06", "sns", "time"}, {"q07", "ott", "time"}, {"q08", "music", "time"}, {"q09", "webtoon", "time"},
            {"q10", "game", "time"}, {"q11", "specialty_mall", "time"}, {"q12", "mobile_bank", "time"}, {"q13", "online_stock", "time"},
            {"q14", "land_transport", "time"}};
    public static final int[] NORMAL = {5, 3, 2, 6, 3, 4, 2, 5, 1, 4, 2, 3, 1, 2};

    // 가상 기준값 공식: 연령대 a, 문항 i의 로그 평균.
    static double logMean(int a, int i, String metric) {
        return "days".equals(metric) ? Math.log(0.1 + 0.08 * ((a * 5 + i * 3) % 7)) : Math.log(2 + 4 * ((a * 3 + i * 5) % 9));
    }

    // 문항별 기준값 공식으로 가상 산출물을 만든다.
    public static ProfileData data(BiFunction<Integer, Integer, Double> override) {
        var ages = AGES.stream().map(a -> new ProfileData.AgeGroup(a, a)).toList();
        Set<String> codes = new LinkedHashSet<>();
        for (var q : QUESTIONS) codes.add(q[1]);
        var minors = codes.stream().map(c -> new ProfileData.Minor(c, "이름_" + c, "가상대분류", null)).toList();
        var meta = new ProfileData.Meta(1, false, "가상 통계", List.of("2025-01", "2025-06"), ages, minors, List.of("가상대분류"),
                new ProfileData.Metrics(true, false, false), null, List.of(), Map.of());
        List<ProfileData.ReferenceItem> items = new ArrayList<>();
        for (int i = 0; i < QUESTIONS.length; i++) {
            Map<String, ProfileData.ReferenceValue> values = new LinkedHashMap<>();
            for (int a = 0; a < AGES.size(); a++) {
                Double value = override == null ? null : override.apply(a, i);
                double log = value != null ? value : logMean(a, i, QUESTIONS[i][2]);
                values.put(AGES.get(a), Double.isNaN(log) ? null : new ProfileData.ReferenceValue(log, Math.exp(log) * ("days".equals(QUESTIONS[i][2]) ? 7 : 1)));
            }
            items.add(new ProfileData.ReferenceItem(QUESTIONS[i][1], QUESTIONS[i][2], values));
        }
        return new ProfileData(meta, List.of(), new ProfileData.SurveyReference(List.of("2025-01", "2025-06"), items), null);
    }

    // 14문항 설정을 만든다.
    public static List<SurveyQuestions.Question> questions() {
        return Arrays.stream(QUESTIONS).map(q -> new SurveyQuestions.Question(q[0], q[1], q[2], true, "가상 문항 " + q[0], null)).toList();
    }

    // 분석 시험값과 같은 v2 매칭 설정을 만든다.
    public static SimilaritySettings settings(List<Double> minutes) {
        return new SimilaritySettings(true, "clr_nearest", null, null, null, "joint", null, List.of(), 6, "answered_items", "joint",
                minutes, 7.0, 0.05, 0.1, null);
    }

    // 또래 비교 시험 설정을 만든다.
    public static PeerMessages peer() {
        return new PeerMessages(1.5, 0.67, 2, new PeerMessages.Templates("{age} 더 {name}", "{age} 덜 {name}", "{match} {age}", "{age} 안내"),
                Map.of("sns", new PeerMessages.Category(true, "SNS 제안"), "weather", new PeerMessages.Category(false, null)));
    }

    // 문항 순서대로 값(null이면 not_used)을 넣은 요청을 만든다.
    static SurveyRequest request(String ageGroup, int... values) {
        List<SurveyRequest.Answer> answers = new ArrayList<>();
        for (int i = 0; i < values.length; i++) {
            answers.add(values[i] == 0 ? new SurveyRequest.Answer(null, null, null, QUESTIONS[i][0], "not_used", null)
                    : new SurveyRequest.Answer(null, null, null, QUESTIONS[i][0], "answered", (double) values[i]));
        }
        return new SurveyRequest(null, ageGroup, answers);
    }

    static final List<Double> MINUTES = List.of(1.7, 5.5, 17.3, 42.4, 84.9);

    // 기본 시험 설정으로 매칭한다.
    static ClrMatcher.Result run(ProfileData data, SurveyRequest request) {
        return ClrMatcher.calculate(data, settings(MINUTES), questions(), 5, peer(), request);
    }

    @Test void normalFourteenMatchesPythonRankingDistancesAndEvidence() {
        var result = run(data(null), request(null, NORMAL));
        assertEquals("comparable", result.status());
        assertEquals(List.of("30s", "60plus", "50s", "20s", "40s", "under20"), result.rankings().stream().map(ClrMatcher.Ranking::ageGroup).toList());
        assertEquals(List.of(3.857, 4.097, 5.343, 5.59, 5.622, 5.804), result.rankings().stream().map(ClrMatcher.Ranking::distance).toList());
        assertEquals(List.of(1, 2, 3, 4, 5, 6), result.rankings().stream().map(ClrMatcher.Ranking::rank).toList());
        assertEquals("30s", result.evidenceGroup().id());
        assertFalse(result.nearTie().isNear());
        assertEquals(0.059, result.nearTie().gapRatio());
        assertEquals(List.of("q02", "q03", "q12"), result.closest().stream().map(ClrMatcher.Evidence::questionId).toList());
        assertEquals(List.of(0.14, 0.25, 0.39), result.closest().stream().map(ClrMatcher.Evidence::difference).toList());
        assertEquals(List.of("q13", "q14", "q08"), result.farthest().stream().map(ClrMatcher.Evidence::questionId).toList());
        assertEquals(List.of("less", "less", "more"), result.farthest().stream().map(ClrMatcher.Evidence::direction).toList());
        assertEquals(14, result.comparedItems());
        assertEquals(List.of("2025-01", "2025-06"), result.referenceMonths());
        assertEquals("일", result.closest().getFirst().unit());
        assertEquals(3.0, result.closest().getFirst().userValue());
        assertNull(result.peerComparison());
        assertNull(result.nextAction());
        assertEquals("pending", result.resultType().status());
    }

    @Test void notUsedAndUnknownAreExcludedAndCenteringUsesAnsweredOnly() {
        int[] values = NORMAL.clone();
        values[12] = 0;
        List<SurveyRequest.Answer> answers = new ArrayList<>(request(null, values).answers());
        answers.remove(10);
        var result = run(data(null), new SurveyRequest(null, null, answers));
        assertEquals(12, result.comparedItems());
        assertEquals(List.of(new ClrMatcher.Excluded("q11", "specialty_mall", "이름_specialty_mall", "unknown"),
                new ClrMatcher.Excluded("q13", "online_stock", "이름_online_stock", "not_used")), result.excluded());
        assertEquals(12, result.answeredCount());
    }

    @Test void fiveAnsweredItemsAreInsufficientWithEmptyEvidenceAndExploreAction() {
        var result = run(data(null), request("30s", 5, 3, 2, 6, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0));
        assertEquals("insufficient", result.status());
        assertEquals("too_few_items", result.reasonCode());
        assertEquals(5, result.comparedItems());
        assertTrue(result.rankings().isEmpty() && result.matches().isEmpty() && result.closest().isEmpty() && result.farthest().isEmpty());
        assertNull(result.nearTie());
        assertNull(result.patternClarity());
        assertNull(result.evidenceGroup());
        assertNull(result.peerComparison());
        assertEquals("/explore", result.nextAction().path());
    }

    @Test void sameMultiplierOnEveryAnswerDoesNotChangeRanking() {
        List<Double> doubling = List.of(1.0, 2.0, 4.0, 8.0, 16.0);
        var low = ClrMatcher.calculate(data(null), settings(doubling), questions(), 5, null, request(null, 0, 0, 0, 0, 1, 2, 3, 1, 2, 3, 1, 2, 3, 4));
        var high = ClrMatcher.calculate(data(null), settings(doubling), questions(), 5, null, request(null, 0, 0, 0, 0, 2, 3, 4, 2, 3, 4, 2, 3, 4, 5));
        assertEquals(low.rankings(), high.rankings());
    }

    @Test void identicalGroupsAreJointFirstAndNearTie() {
        var data = data((a, i) -> a == 4 ? logMean(2, i, QUESTIONS[i][2]) : null);
        var result = run(data, request(null, NORMAL));
        assertEquals(List.of("30s", "50s"), result.matches().stream().map(ProfileData.AgeGroup::id).toList());
        assertEquals(1, result.rankings().get(1).rank());
        assertTrue(result.rankings().get(0).isTied() && result.rankings().get(1).isTied());
        assertTrue(result.nearTie().isNear());
        assertEquals("50s", result.nearTie().second().id());
    }

    @Test void missingGroupReferenceExcludesQuestionAsGroupMissing() {
        var result = run(data((a, i) -> a == 5 && i == 0 ? Double.NaN : null), request(null, NORMAL));
        assertEquals("group_missing", result.excluded().getFirst().reason());
        assertEquals("q01", result.excluded().getFirst().questionId());
        assertEquals(13, result.comparedItems());
    }

    @Test void sameInputGivesSameResult() {
        assertEquals(run(data(null), request("20s", NORMAL)), run(data(null), request("20s", NORMAL)));
    }

    @Test void invalidAnswersAreRejectedWithCodes() {
        Map<String, SurveyRequest> cases = new LinkedHashMap<>();
        cases.put("INVALID_VALUE", request(null, 8));
        cases.put("INVALID_VALUE ", new SurveyRequest(null, null, List.of(new SurveyRequest.Answer(null, null, null, "q01", "answered", 2.5))));
        cases.put("INVALID_VALUE  ", new SurveyRequest(null, null, List.of(new SurveyRequest.Answer(null, null, null, "q05", "answered", 6.0))));
        cases.put("INVALID_VALUE   ", new SurveyRequest(null, null, List.of(new SurveyRequest.Answer(null, null, null, "q01", "not_used", 3.0))));
        cases.put("DUPLICATE_QUESTION", new SurveyRequest(null, null, List.of(request(null, 3).answers().getFirst(), request(null, 4).answers().getFirst())));
        cases.put("INVALID_STATUS", new SurveyRequest(null, null, List.of(new SurveyRequest.Answer(null, null, null, "q01", "answerd", 3.0))));
        cases.put("UNKNOWN_QUESTION", new SurveyRequest(null, null, List.of(new SurveyRequest.Answer(null, null, null, "q99", "answered", 3.0))));
        cases.put("INVALID_AGE_GROUP", request("10s", NORMAL));
        cases.put("MISSING_PARAMETER", new SurveyRequest(null, null, null));
        cases.forEach((code, request) -> {
            var error = assertThrows(ApiException.class, () -> run(data(null), request), code);
            assertEquals(code.trim(), error.code());
        });
    }

    @Test void statedAgeGroupDoesNotChangeMatching() {
        var without = run(data(null), request(null, NORMAL));
        var with = run(data(null), request("30s", NORMAL));
        assertEquals(without.rankings(), with.rankings());
        assertEquals(without.closest(), with.closest());
        assertNull(without.peerComparison());
        assertNotNull(with.peerComparison());
    }

    @Test void peerComparisonMatchesPythonRelativeRatios() {
        var peer = run(data(null), request("30s", NORMAL)).peerComparison();
        assertEquals(List.of("q08", "q07"), peer.more().stream().map(ClrMatcher.PeerItem::questionId).toList());
        assertEquals(List.of(4.53, 3.23), peer.more().stream().map(ClrMatcher.PeerItem::relativeRatio).toList());
        assertEquals(List.of("q13", "q14"), peer.less().stream().map(ClrMatcher.PeerItem::questionId).toList());
        assertEquals(List.of(0.14, 0.19), peer.less().stream().map(ClrMatcher.PeerItem::relativeRatio).toList());
        assertEquals("30s 더 이름_music", peer.more().getFirst().message());
        assertTrue(peer.matchesStated());
        assertEquals("30s 안내", peer.note());
        assertEquals(14, peer.comparedItems());
    }

    @Test void peerSuggestionOnlyForReduceCategoriesAndThresholdsAreApplied() {
        int[] inputs = {3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3};
        BiFunction<Integer, Integer, Double> flat = (a, i) -> Math.log("days".equals(QUESTIONS[i][2]) ? 3 / 7.0 : 17.3);
        var sns = run(data((a, i) -> i == 5 && a == 1 ? Math.log(17.3 / 2) : flat.apply(a, i)), request("20s", inputs)).peerComparison();
        assertEquals(List.of("q06"), sns.more().stream().map(ClrMatcher.PeerItem::questionId).toList());
        assertTrue(sns.less().isEmpty());
        assertEquals(new ClrMatcher.Suggestion("q06", "SNS 제안"), sns.suggestion());
        var weather = run(data((a, i) -> i == 0 && a == 1 ? Math.log(3 / 7.0 / 2) : flat.apply(a, i)), request("20s", inputs)).peerComparison();
        assertEquals(List.of("q01"), weather.more().stream().map(ClrMatcher.PeerItem::questionId).toList());
        assertNull(weather.suggestion());
        var notUsed = inputs.clone();
        notUsed[5] = 0;
        var excluded = run(data((a, i) -> i == 5 && a == 1 ? Math.log(17.3 / 2) : flat.apply(a, i)), request("20s", notUsed)).peerComparison();
        assertEquals(13, excluded.comparedItems());
        assertTrue(excluded.more().isEmpty());
    }

    @Test void disabledSettingsOrMissingReferenceAreComparisonDisabled() {
        var disabled = new SimilaritySettings(false, "clr_nearest", null, null, null, null, null, null, 6, null, null, null, 7.0, null, null, null);
        assertEquals("comparison_disabled", ClrMatcher.calculate(data(null), disabled, questions(), 5, peer(), request(null, NORMAL)).reasonCode());
        var noReference = new ProfileData(data(null).meta(), List.of());
        assertEquals("comparison_disabled", run(noReference, request(null, NORMAL)).reasonCode());
    }
}
