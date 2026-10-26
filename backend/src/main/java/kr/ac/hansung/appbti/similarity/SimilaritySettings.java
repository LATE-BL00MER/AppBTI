package kr.ac.hansung.appbti.similarity;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public record SimilaritySettings(boolean enabled, String method, String normalization,
                                 Map<String, Double> weights, Integer minimum_categories,
                                 String tie_policy, String zero_days_policy, Object types) {
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
                return mapper.convertValue(new Yaml().load(stream), SimilaritySettings.class);
            }
        }

        public SimilaritySettings forData(boolean isMock) { return isMock ? mock : actual; }
    }
}
