package kr.ac.hansung.appbti.profile;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.ac.hansung.appbti.similarity.SimilarityCalculator;
import kr.ac.hansung.appbti.similarity.SimilaritySettings;
import kr.ac.hansung.appbti.survey.SurveyRequest;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final ProfileRepository repository;
    private final SimilaritySettings.Loader settings;
    private final ObjectMapper mapper;
    private final SurveySummary survey;

    public ApiController(ProfileRepository repository, SimilaritySettings.Loader settings, ObjectMapper mapper, SurveySummary survey) {
        this.repository = repository; this.settings = settings; this.mapper = mapper; this.survey = survey;
    }

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

    @GetMapping("/profiles")
    public Map<String, Object> profiles(@RequestParam(required = false) String month, @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        String selected = repository.month(data, month);
        return Map.of("month", selected, "profiles", data.profiles().stream().filter(r -> r.month().equals(selected)).toList());
    }

    @GetMapping("/profiles/trend")
    public Map<String, Object> trend(@RequestParam String minor, @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        if (data.meta().minorCategories().stream().noneMatch(c -> c.code().equals(minor))) throw new IllegalArgumentException("제공하지 않는 중분류입니다.");
        return Map.of("minorCode", minor, "profiles", data.profiles().stream().filter(r -> r.minorCode().equals(minor)).toList(),
                "continuityBreaks", data.meta().continuityBreaks());
    }

    @GetMapping("/explore/ranking")
    public ExploreRanking.Result ranking(@RequestParam(required = false) String ageGroup, @RequestParam(required = false) String month,
            @RequestParam(required = false) String basis, @RequestParam(required = false) String major,
            @RequestParam(required = false) String limit, @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        // 형식 오류도 다른 조회 API처럼 message가 있는 400으로 돌려준다.
        if (ageGroup == null || ageGroup.isBlank()) throw new IllegalArgumentException("ageGroup은 필수입니다.");
        Integer size = null;
        if (limit != null) {
            try { size = Integer.valueOf(limit); } catch (NumberFormatException error) { throw new IllegalArgumentException("limit은 1 이상 정수여야 합니다."); }
        }
        return ExploreRanking.rank(data, ageGroup, repository.month(data, month), ExploreRanking.Basis.parse(basis), major, size);
    }

    @GetMapping("/survey/questions")
    public Map<String, Object> questions(@RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        var config = settings.forData(data.meta().isMock());
        Map<String, Object> result = new LinkedHashMap<>(Map.of("month", data.meta().latestMonth(), "questions", data.meta().minorCategories(),
                "maxDays", YearMonth.parse(data.meta().latestMonth()).lengthOfMonth(),
                "timeAvailable", data.meta().metrics().timeComparable(),
                "minimumCategories", config.minimum_categories() == null ? data.meta().minorCategories().size() : config.minimum_categories()));
        result.put("zeroDaysPolicy", config.zero_days_policy());
        return result;
    }

    @PostMapping("/survey/result")
    public SimilarityCalculator.Result result(@RequestBody SurveyRequest request, @RequestParam(defaultValue = "basic") String dataset) {
        var data = repository.get(dataset);
        return SimilarityCalculator.calculate(data, settings.forData(data.meta().isMock()), request, repository.month(data, request.month()));
    }
}
