package kr.ac.hansung.appbti.similarity;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SimilaritySettingsTests {
    @TempDir Path directory;
    private static final String VALID = """
            enabled: true
            method: weighted_absolute_distance
            normalization: min_max
            weights:
            minimum_categories: 4
            tie_policy: joint
            zero_days_policy: exclude
            """;

    private SimilaritySettings.Loader load(String yaml) throws IOException {
        Path file = directory.resolve("similarity.yaml");
        Files.writeString(file, yaml);
        return new SimilaritySettings.Loader(new ObjectMapper(), file.toString(), file.toString());
    }

    @Test void blankWeightsAreNormalizedBeforeServingRequests() throws Exception {
        var settings = load(VALID).forData(true);
        assertTrue(settings.weights().isEmpty());
        assertEquals("comparable", SimilarityCalculator.calculate(SimilarityCalculatorTests.fixture(false), settings,
                SimilarityCalculatorTests.request(10), "2025-06").status());
    }

    @Test void invalidActiveSettingsFailLoadingRatherThanUserRequests() {
        for (String invalid : List.of(
                VALID.replace("weighted_absolute_distance", "unknown"),
                VALID.replace("min_max", "unknown"),
                VALID.replace("joint", "unknown"),
                VALID.replace("exclude", "unknown"),
                VALID.replace("minimum_categories: 4", "minimum_categories:"),
                VALID.replace("minimum_categories: 4", "minimum_categories: 0"),
                VALID.replace("weights:", "weights: {c0: -1}"),
                VALID.replace("weights:", "weights: {c0: null}"),
                VALID.replace("weights:", "weights: {c0: .inf}"),
                "")) {
            var error = assertThrows(IOException.class, () -> load(invalid));
            assertTrue(error.getMessage().contains("유사도 설정 오류"));
        }
    }

    @Test void disabledActualSettingsCanRemainUndecided() throws Exception {
        var settings = load("enabled: false\nweights:\n").forData(false);
        assertFalse(settings.enabled());
        assertTrue(settings.weights().isEmpty());
        assertNull(settings.zero_days_policy());
    }

    @Test void includeZeroDaysPolicyActuallyUsesZeroAnswers() throws Exception {
        var settings = load(VALID.replace("exclude", "include")).forData(true);
        var answers = new ArrayList<>(SimilarityCalculatorTests.request(10).answers());
        answers.set(0, new kr.ac.hansung.appbti.survey.SurveyRequest.Answer("c0", 0.0, null));
        var result = SimilarityCalculator.calculate(SimilarityCalculatorTests.fixture(false), settings,
                new kr.ac.hansung.appbti.survey.SurveyRequest(null, answers), "2025-06");
        assertEquals(6, result.comparedCategories());
        assertTrue(result.excluded().isEmpty());
    }
}
