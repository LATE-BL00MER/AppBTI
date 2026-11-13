package kr.ac.hansung.appbti.profile;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * /meta.survey의 설문 요약(홈 화면 소개 문구용). 실제 데이터는 config/survey_questions.yaml의 활성 문항을 센다.
 * 문항 자체의 제공·검증은 /survey/questions(신진용)가 맡고, 여기서는 개수와 기간만 읽는다.
 */
@Component
public class SurveySummary {
    private static final Logger log = LoggerFactory.getLogger(SurveySummary.class);
    private final Integer questionCount;
    private final String period;

    public SurveySummary(@Value("${appbti.survey-questions-path}") String path) throws IOException {
        Path file = Path.of(path);
        if (!Files.isRegularFile(file)) {
            // 문항 확정 전에는 null로 두고 화면이 임의 숫자를 쓰지 않게 한다.
            log.warn("설문 문항 설정이 없어 /meta.survey의 문항 수·기간을 null로 둡니다: {}", file.toAbsolutePath().normalize());
            questionCount = null;
            period = null;
            return;
        }
        try (var stream = Files.newInputStream(file)) {
            if (!(new Yaml().load(stream) instanceof Map<?, ?> document)) throw new IllegalArgumentException("YAML 설정 객체가 필요합니다.");
            if (!(document.get("questions") instanceof List<?> questions)) throw new IllegalArgumentException("questions 목록이 필요합니다.");
            questionCount = (int) questions.stream()
                    .filter(q -> q instanceof Map<?, ?> question && Boolean.TRUE.equals(question.get("enabled"))).count();
            period = document.get("period") instanceof String value ? value : null;
        } catch (RuntimeException error) {
            throw new IOException("설문 문항 설정 오류: " + path + " — " + error.getMessage(), error);
        }
    }

    public record Summary(Integer questionCount, String period, String method) {}

    /** 목업은 지금처럼 중분류 전체가 문항이다. method는 데이터별 유사도 설정을 따른다. */
    public Summary forData(ProfileData.Meta meta, String method) {
        return meta.isMock() ? new Summary(meta.minorCategories().size(), "monthly", method)
                : new Summary(questionCount, period, method);
    }
}
