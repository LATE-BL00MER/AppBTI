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
import java.util.Map;

public record SimilaritySettings(boolean enabled, String method, String normalization,
                                 Map<String, Double> weights, Integer minimum_categories,
                                 String tie_policy, String zero_days_policy, Object types) {
    public SimilaritySettings {
        weights = weights == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(weights));
        // 비활성 실제 설정의 미확정 값은 유지하고, 활성 설정은 요청 처리 전에 검증한다.
        if (enabled) {
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

    @Component
    public static class Loader {
        private final SimilaritySettings actual;
        private final SimilaritySettings mock;

        public Loader(ObjectMapper mapper, @Value("${appbti.similarity-path}") String actualPath,
                      @Value("${appbti.mock-similarity-path}") String mockPath) throws IOException {
            actual = read(mapper, actualPath);
            mock = read(mapper, mockPath);
        }

        private SimilaritySettings read(ObjectMapper mapper, String path) throws IOException {
            try (var stream = Files.newInputStream(Path.of(path))) {
                Object document = new Yaml().load(stream);
                if (!(document instanceof Map)) throw new IllegalArgumentException("YAML 설정 객체가 필요합니다.");
                return mapper.convertValue(document, SimilaritySettings.class);
            } catch (RuntimeException error) {
                throw new IOException("유사도 설정 오류: " + path + " — " + error.getMessage(), error);
            }
        }

        public SimilaritySettings forData(boolean isMock) { return isMock ? mock : actual; }
    }
}
