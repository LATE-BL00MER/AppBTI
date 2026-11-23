package kr.ac.hansung.appbti.similarity;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** similarity.yaml. method가 clr_nearest면 API v2 매칭, weighted_absolute_distance면 v1(목업) 방식이다. */
public record SimilaritySettings(boolean enabled, String method, String normalization,
                                 Map<String, Double> weights, Integer minimum_categories,
                                 String tie_policy, String zero_days_policy, Object types,
                                 Integer minimum_items, String clr_scope, String clr_blocks,
                                 List<Double> time_choice_minutes, Double days_scale, Double near_tie_ratio,
                                 Double similar_difference, Double flat_pattern_ratio, Double close_value_ratio,
                                 List<Double> time_choice_edges) {
    public static final String CLR_NEAREST = "clr_nearest";

    // 활성 설정이면 방식별 필수 값을 요청 처리 전에 검증한다.
    public SimilaritySettings {
        weights = weights == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(weights));
        if (enabled && CLR_NEAREST.equals(method)) {
            if (minimum_items == null || minimum_items < 1 || !"answered_items".equals(clr_scope) || !"joint".equals(clr_blocks)
                    || time_choice_minutes == null || time_choice_minutes.isEmpty()
                    || time_choice_minutes.stream().anyMatch(m -> m == null || !(m > 0) || !Double.isFinite(m))
                    || days_scale == null || !(days_scale >= 1) || near_tie_ratio == null || !(near_tie_ratio >= 0)
                    || similar_difference == null || !(similar_difference >= 0)
                    || (flat_pattern_ratio != null && !(flat_pattern_ratio >= 0))
                    || close_value_ratio == null || !(close_value_ratio > 1)
                    || (time_choice_edges != null && !validEdges(time_choice_edges, time_choice_minutes.size()))) {
                throw new IllegalArgumentException("clr_nearest 설정의 최소 문항·CLR 범위·시간 대표 분·일수 척도·근소 기준·가까운 항목 배수를 확인하세요.");
            }
        } else if (enabled) {
            if (!"weighted_absolute_distance".equals(method) || !"min_max".equals(normalization)
                    || !"joint".equals(tie_policy)
                    || !("exclude".equals(zero_days_policy) || "include".equals(zero_days_policy))
                    || minimum_categories == null || minimum_categories < 1) {
                throw new IllegalArgumentException("활성 유사도 설정의 방식·정규화·최소 항목·동점·0일 정책을 확인하세요.");
            }
            for (var weight : weights.entrySet()) {
                if (weight.getKey() == null || weight.getValue() == null
                        || !Double.isFinite(weight.getValue()) || weight.getValue() < 0) {
                    throw new IllegalArgumentException("유사도 가중치는 유한한 0 이상 숫자여야 합니다.");
                }
            }
        }
    }

    // v1 방식 설정(clr_nearest 값 없음)을 만든다.
    public SimilaritySettings(boolean enabled, String method, String normalization, Map<String, Double> weights,
                              Integer minimum_categories, String tie_policy, String zero_days_policy, Object types) {
        this(enabled, method, normalization, weights, minimum_categories, tie_policy, zero_days_policy, types,
                null, null, null, null, null, null, null, null, null, null);
    }

    // 선택지 경계는 선택지 수보다 하나 적고, 양수이며 오름차순이어야 한다.
    private static boolean validEdges(List<Double> edges, int choices) {
        if (edges.size() != choices - 1) return false;
        for (int i = 0; i < edges.size(); i++) {
            if (edges.get(i) == null || !(edges.get(i) > 0) || (i > 0 && !(edges.get(i) > edges.get(i - 1)))) return false;
        }
        return true;
    }

    // API v2 매칭 방식인지 알려 준다.
    public boolean isClr() { return CLR_NEAREST.equals(method); }

    @Component
    public static class Loader {
        private final SimilaritySettings actual;
        private final SimilaritySettings mock;

        // 실제·목업 유사도 설정을 기동 시 읽는다.
        public Loader(ObjectMapper mapper, @Value("${appbti.similarity-path}") String actualPath,
                      @Value("${appbti.mock-similarity-path}") String mockPath) throws IOException {
            actual = read(mapper, actualPath);
            mock = read(mapper, mockPath);
        }

        // YAML 파일 하나를 설정 객체로 읽는다.
        private SimilaritySettings read(ObjectMapper mapper, String path) throws IOException {
            try (var stream = Files.newInputStream(Path.of(path))) {
                Object document = new Yaml().load(stream);
                if (!(document instanceof Map)) throw new IllegalArgumentException("YAML 설정 객체가 필요합니다.");
                return mapper.convertValue(document, SimilaritySettings.class);
            } catch (RuntimeException error) {
                throw new IOException("유사도 설정 오류: " + path + " — " + error.getMessage(), error);
            }
        }

        // 데이터 종류(목업/실제)에 맞는 설정을 돌려준다.
        public SimilaritySettings forData(boolean isMock) { return isMock ? mock : actual; }
    }
}
