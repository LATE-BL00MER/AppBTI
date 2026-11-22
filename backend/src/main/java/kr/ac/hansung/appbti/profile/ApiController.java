package kr.ac.hansung.appbti.profile;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.ac.hansung.appbti.similarity.ClrMatcher;
import kr.ac.hansung.appbti.similarity.PeerMessages;
import kr.ac.hansung.appbti.similarity.SimilarityCalculator;
import kr.ac.hansung.appbti.similarity.SimilaritySettings;
import kr.ac.hansung.appbti.survey.SurveyQuestions;
import kr.ac.hansung.appbti.survey.SurveyRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final ProfileRepository repository;
    private final SimilaritySettings.Loader settings;
    private final ObjectMapper mapper;
    private final SurveySummary survey;
    private final SurveyQuestions questions;
    private final PeerMessages.Loader peer;

    // 산출물·설정 저장소를 주입받는다.
    public ApiController(ProfileRepository repository, SimilaritySettings.Loader settings, ObjectMapper mapper, SurveySummary survey,
                         SurveyQuestions questions, PeerMessages.Loader peer) {
        this.repository = repository; this.settings = settings; this.mapper = mapper; this.survey = survey;
        this.questions = questions; this.peer = peer;
    }

    // 기간·연령대·분류 목록과 설문 요약을 돌려준다.
    @GetMapping("/meta")
    public Map<String, Object> meta(@RequestParam(defaultValue = "basic") String dataset) {
        var meta = repository.get(dataset).meta();
        Map<String, Object> result = mapper.convertValue(meta, new TypeReference<LinkedHashMap<String, Object>>() {});
        result.put("availableDatasets", repository.availableDatasets());
        result.put("dataset", dataset);
        result.put("comparisonEnabled", settings.forData(meta.isMock()).enabled());
        result.put("zeroDaysPolicy", settings.forData(meta.isMock()).zero_days_policy());
        result.put("survey", survey.forData(meta, settings.forData(meta.isMock()).method()));
        return result;
    }

    // 한 달의 연령대별 중분류 Profile을 돌려준다(생략 시 최신월).
    @GetMapping("/profiles")
    public Map<String, Object> profiles(@RequestParam(required = false) String month, @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        String selected = repository.month(data, month);
        return Map.of("month", selected, "profiles", data.profiles().stream().filter(r -> r.month().equals(selected)).toList());
    }

    // 한 중분류의 연령대별 월별 변화를 돌려준다.
    @GetMapping("/profiles/trend")
    public Map<String, Object> trend(@RequestParam String minor, @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        if (data.meta().minorCategories().stream().noneMatch(c -> c.code().equals(minor))) throw ApiException.badRequest("INVALID_MINOR", "제공하지 않는 중분류입니다.");
        return Map.of("minorCode", minor, "profiles", data.profiles().stream().filter(r -> r.minorCode().equals(minor)).toList(),
                "continuityBreaks", data.meta().continuityBreaks());
    }

    // 한 연령대의 중분류 랭킹을 돌려준다.
    @GetMapping("/explore/ranking")
    public ExploreRanking.Result ranking(@RequestParam(required = false) String ageGroup, @RequestParam(required = false) String month,
            @RequestParam(required = false) String basis, @RequestParam(required = false) String major,
            @RequestParam(required = false) String limit, @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        if (ageGroup == null || ageGroup.isBlank()) throw ApiException.badRequest("MISSING_PARAMETER", "ageGroup은 필수입니다.");
        return ExploreRanking.rank(data, ageGroup, repository.month(data, month), ExploreRanking.Basis.parse(basis), major, limit(limit));
    }

    // 한 달의 특이 신호를 연령대·유형·지표·대분류로 골라 돌려준다.
    @GetMapping("/explore/signals")
    public ExploreSignals.Result signals(@RequestParam String month, @RequestParam(required = false) String ageGroup,
            @RequestParam(required = false) String type, @RequestParam(required = false) String metric,
            @RequestParam(required = false) String major, @RequestParam(required = false) String limit,
            @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        return ExploreSignals.find(data, repository.month(data, month), ageGroup, type, metric, major, limit(limit));
    }

    // 설문 문항과 응답 형식을 돌려준다(similarity 설정이 clr_nearest면 v2, 아니면 v1).
    @GetMapping("/survey/questions")
    public Map<String, Object> questions(@RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        var config = settings.forData(data.meta().isMock());
        if (config.isClr()) return questionsV2(data, config);
        Map<String, Object> result = new LinkedHashMap<>(Map.of("month", data.meta().latestMonth(), "questions", data.meta().minorCategories(),
                "maxDays", YearMonth.parse(data.meta().latestMonth()).lengthOfMonth(),
                "timeAvailable", data.meta().metrics().timeComparable(),
                "minimumCategories", config.minimum_categories() == null ? data.meta().minorCategories().size() : config.minimum_categories()));
        result.put("zeroDaysPolicy", config.zero_days_policy());
        return result;
    }

    // 설문 응답을 연령대 통계와 비교한 결과를 돌려준다(clr_nearest면 v2 CLR 매칭, 아니면 v1).
    @PostMapping("/survey/result")
    public Object result(@RequestBody SurveyRequest request, @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        var config = settings.forData(data.meta().isMock());
        if (config.isClr()) {
            var questions = this.questions.forData(data.meta().isMock());
            if (!questions.available()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SURVEY_UNAVAILABLE", "설문 문항 설정을 준비하지 못했습니다.");
            return ClrMatcher.calculate(data, config, questions.served(data.meta()), questions.timeChoices(), peer.get(), request);
        }
        return SimilarityCalculator.calculate(data, config, request, repository.month(data, request.month()));
    }

    // v2 문항 목록·응답 형식·최소 문항 수를 만든다.
    private Map<String, Object> questionsV2(ProfileData data, SimilaritySettings config) {
        var questions = this.questions.forData(data.meta().isMock());
        if (!questions.available()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SURVEY_UNAVAILABLE", "설문 문항 설정을 준비하지 못했습니다.");
        var minors = data.meta().minorCategories();
        var served = questions.served(data.meta());
        List<Map<String, Object>> list = served.stream().map(q -> {
            var minor = minors.stream().filter(m -> m.code().equals(q.minor_code())).findFirst().orElseThrow();
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", q.id()); item.put("minorCode", minor.code()); item.put("name", minor.name()); item.put("major", minor.major());
            item.put("metric", q.metric()); item.put("text", q.text()); item.put("guide", q.guide());
            return item;
        }).toList();
        var choices = questions.timeChoices();
        Map<String, Object> formats = new LinkedHashMap<>();
        formats.put("days", Map.of("min", 1, "max", (int) Math.round(config.days_scale() == null ? 7 : config.days_scale()), "unit", "일",
                "allowNotUsed", true, "allowUnknown", true));
        formats.put("time", Map.of("choices", IntStream.range(0, choices.size()).mapToObj(i -> Map.of("value", i + 1, "label", choices.get(i))).toList(),
                "allowNotUsed", true, "allowUnknown", true));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period", questions.period());
        result.put("questions", list);
        result.put("answerFormats", formats);
        result.put("minimumItems", config.minimum_items());
        result.put("comparisonEnabled", config.enabled() && data.surveyReference() != null);
        result.put("timeAvailable", served.stream().anyMatch(q -> "time".equals(q.metric())));
        return result;
    }

    // limit 문자열을 1 이상 정수로 읽는다. 생략하면 null.
    private static Integer limit(String limit) {
        if (limit == null) return null;
        try { return Integer.valueOf(limit); } catch (NumberFormatException error) { throw ApiException.badRequest("INVALID_LIMIT", "limit은 1 이상 정수여야 합니다."); }
    }
}
