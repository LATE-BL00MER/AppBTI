package kr.ac.hansung.appbti.survey;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.ac.hansung.appbti.profile.ProfileData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** config/survey_questions.yaml(API v2 14문항)과 목업용 survey_questions.mock.yaml. 파일이 없으면 그 데이터의 설문을 제공하지 않는다. */
@Component
public class SurveyQuestions {
    private static final Logger log = LoggerFactory.getLogger(SurveyQuestions.class);

    public record Question(String id, String minor_code, String metric, boolean enabled, String text, String guide) {}
    public record Config(String period, List<String> time_choices, List<Question> questions) {}

    private final Config config;
    private final SurveyQuestions mock;

    // 실제·목업 문항 설정 파일을 기동 시 읽고 형식을 검사한다.
    @Autowired
    public SurveyQuestions(ObjectMapper mapper, @Value("${appbti.survey-questions-path}") String path,
                           @Value("${appbti.mock-survey-questions-path}") String mockPath) throws IOException {
        config = read(mapper, path);
        mock = new SurveyQuestions(read(mapper, mockPath));
    }

    // 설정 파일 하나를 읽는다. 없으면 null.
    private static Config read(ObjectMapper mapper, String path) throws IOException {
        Path file = Path.of(path);
        if (!Files.isRegularFile(file)) {
            log.warn("설문 문항 설정이 없어 이 데이터의 설문을 제공하지 않습니다: {}", file.toAbsolutePath().normalize());
            return null;
        }
        try (var stream = Files.newInputStream(file)) {
            Object document = new Yaml().load(stream);
            if (!(document instanceof Map)) throw new IllegalArgumentException("YAML 설정 객체가 필요합니다.");
            return validate(mapper.convertValue(document, Config.class));
        } catch (RuntimeException error) {
            throw new IOException("설문 문항 설정 오류: " + path + " — " + error.getMessage(), error);
        }
    }

    // 테스트·다른 설정에서 문항 설정을 직접 넣어 만든다.
    public SurveyQuestions(Config config) { this.config = config == null ? null : validate(config); this.mock = null; }

    // 데이터 종류(실제·목업)에 맞는 문항 설정을 돌려준다.
    public SurveyQuestions forData(boolean isMock) { return isMock && mock != null ? mock : this; }

    // 문항 ID 중복, 지표 이름, 시간 선택지를 검사한다.
    private static Config validate(Config config) {
        if (config.questions() == null || config.questions().isEmpty()) throw new IllegalArgumentException("questions 목록이 필요합니다.");
        if (config.time_choices() == null || config.time_choices().isEmpty()) throw new IllegalArgumentException("time_choices가 필요합니다.");
        Set<String> ids = new HashSet<>();
        for (var q : config.questions()) {
            if (q.id() == null || q.minor_code() == null || q.text() == null || !ids.add(q.id())) throw new IllegalArgumentException("문항 id·minor_code·text를 확인하세요: " + q.id());
            if (!"days".equals(q.metric()) && !"time".equals(q.metric())) throw new IllegalArgumentException("metric은 days 또는 time이어야 합니다: " + q.id());
        }
        return config;
    }

    // 문항 설정 파일이 있는지 알려 준다.
    public boolean available() { return config != null; }

    // 일수 문항의 기준 기간(last7days)을 돌려준다.
    public String period() { return config == null ? null : config.period(); }

    // 시간 5지선다 선택지 문구를 돌려준다.
    public List<String> timeChoices() { return config == null ? List.of() : config.time_choices(); }

    // 이 산출물로 제공할 활성 문항을 id 순으로 돌려준다(코드북에 없는 중분류, 시간 지표가 없을 때의 시간 문항 제외).
    public List<Question> served(ProfileData.Meta meta) {
        if (config == null) return List.of();
        Set<String> codes = new HashSet<>();
        meta.minorCategories().forEach(m -> codes.add(m.code()));
        return config.questions().stream()
                .filter(q -> q.enabled() && codes.contains(q.minor_code()) && ("days".equals(q.metric()) || meta.metrics().dailyTime()))
                .sorted(Comparator.comparing(Question::id)).toList();
    }
}
