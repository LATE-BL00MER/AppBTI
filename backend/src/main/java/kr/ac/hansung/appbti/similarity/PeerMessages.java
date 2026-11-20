package kr.ac.hansung.appbti.similarity;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/** config/peer_messages.yaml. 또래 비교(API v2 4-3)의 기준값과 템플릿 문장이다. AI 생성 문장을 쓰지 않는다. */
public record PeerMessages(double more_ratio, double less_ratio, int max_items, Templates templates, Map<String, Category> categories) {
    public record Templates(String more, String less, String stated_differs, String note) {}
    public record Category(boolean suggest_reduce, String reduce) {}

    // 기준값과 필수 템플릿을 검사한다.
    public PeerMessages {
        if (!(more_ratio > 1) || !(less_ratio > 0 && less_ratio < 1) || max_items < 1 || templates == null
                || templates.more() == null || templates.less() == null || templates.note() == null) {
            throw new IllegalArgumentException("또래 비교 기준값(more_ratio > 1, 0 < less_ratio < 1, max_items ≥ 1)과 템플릿을 확인하세요.");
        }
        categories = categories == null ? Map.of() : Map.copyOf(categories);
    }

    // 템플릿의 {이름} 자리를 값으로 바꾼다.
    public static String fill(String template, Map<String, String> values) {
        String text = template;
        for (var entry : values.entrySet()) text = text.replace("{" + entry.getKey() + "}", entry.getValue());
        return text;
    }

    @Component
    public static class Loader {
        private static final Logger log = LoggerFactory.getLogger(Loader.class);
        private final PeerMessages messages;

        // 또래 비교 설정을 기동 시 읽는다. 파일이 없으면 또래 비교를 만들지 않는다.
        public Loader(ObjectMapper mapper, @Value("${appbti.peer-messages-path}") String path) throws IOException {
            Path file = Path.of(path);
            if (!Files.isRegularFile(file)) {
                log.warn("또래 비교 설정이 없어 peerComparison을 만들지 않습니다: {}", file.toAbsolutePath().normalize());
                messages = null;
                return;
            }
            try (var stream = Files.newInputStream(file)) {
                Object document = new Yaml().load(stream);
                if (!(document instanceof Map)) throw new IllegalArgumentException("YAML 설정 객체가 필요합니다.");
                messages = mapper.convertValue(document, PeerMessages.class);
            } catch (RuntimeException error) {
                throw new IOException("또래 비교 설정 오류: " + path + " — " + error.getMessage(), error);
            }
        }

        // 읽은 또래 비교 설정을 돌려준다. 없으면 null.
        public PeerMessages get() { return messages; }
    }
}
