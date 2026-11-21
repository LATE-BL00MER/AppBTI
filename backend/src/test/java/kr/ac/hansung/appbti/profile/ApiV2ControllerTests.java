package kr.ac.hansung.appbti.profile;

import kr.ac.hansung.appbti.similarity.ClrMatcherTests;
import kr.ac.hansung.appbti.similarity.PeerMessages;
import kr.ac.hansung.appbti.similarity.SimilaritySettings;
import kr.ac.hansung.appbti.survey.SurveyQuestions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** API v2 경로·응답 형식·오류 본문(가상 값). 계산 자체는 ClrMatcherTests·ExploreSignalsTests가 맡는다. */
@WebMvcTest(ApiController.class)
class ApiV2ControllerTests {
    @Autowired MockMvc mvc;
    @MockitoBean ProfileRepository repository;
    @MockitoBean SimilaritySettings.Loader settings;
    @MockitoBean SurveySummary survey;
    @MockitoBean SurveyQuestions questions;
    @MockitoBean PeerMessages.Loader peer;

    // 가상 v2 산출물과 설정을 목에 연결한다.
    @BeforeEach void prepare() {
        var survey = ClrMatcherTests.data(null);
        var signals = ExploreSignalsTests.data(true, true);
        var data = new ProfileData(survey.meta(), List.of(), survey.surveyReference(), null);
        when(repository.get("basic")).thenReturn(data);
        when(repository.get("signals")).thenReturn(signals);
        when(repository.month(eq(signals), anyString())).thenAnswer(call -> call.getArgument(1));
        when(repository.get("missing")).thenThrow(new ApiException(HttpStatus.NOT_FOUND, "DATASET_NOT_FOUND", "제공하지 않는 데이터 버전입니다."));
        when(repository.month(eq(data), nullable(String.class))).thenAnswer(call -> {
            String month = call.getArgument(1);
            if (month == null) return "2025-06";
            if (!List.of("2025-01", "2025-04", "2025-06").contains(month)) throw ApiException.badRequest("INVALID_MONTH", "제공하지 않는 기준월입니다.");
            return month;
        });
        when(settings.forData(false)).thenReturn(ClrMatcherTests.settings(List.of(1.7, 5.5, 17.3, 42.4, 84.9)));
        when(questions.available()).thenReturn(true);
        when(questions.period()).thenReturn("last7days");
        when(questions.timeChoices()).thenReturn(List.of("1", "2", "3", "4", "5"));
        when(questions.served(any())).thenReturn(ClrMatcherTests.questions());
        when(peer.get()).thenReturn(ClrMatcherTests.peer());
    }

    @Test void questionsUseV2Shape() throws Exception {
        mvc.perform(get("/api/survey/questions")).andExpect(status().isOk())
                .andExpect(jsonPath("$.period").value("last7days"))
                .andExpect(jsonPath("$.questions.length()").value(14))
                .andExpect(jsonPath("$.questions[0].id").value("q01"))
                .andExpect(jsonPath("$.questions[0].metric").value("days"))
                .andExpect(jsonPath("$.answerFormats.days.max").value(7))
                .andExpect(jsonPath("$.answerFormats.time.choices.length()").value(5))
                .andExpect(jsonPath("$.answerFormats.time.choices[0].minutes").doesNotExist())
                .andExpect(jsonPath("$.minimumItems").value(6))
                .andExpect(jsonPath("$.comparisonEnabled").value(true))
                .andExpect(jsonPath("$.timeAvailable").value(true));
    }

    @Test void resultUsesV2ShapeAndPeerComparison() throws Exception {
        String body = "{\"ageGroup\":\"30s\",\"answers\":[" + String.join(",", java.util.stream.IntStream.range(0, 14)
                .mapToObj(i -> "{\"questionId\":\"q%02d\",\"status\":\"answered\",\"value\":%d}".formatted(i + 1, ClrMatcherTests.NORMAL[i])).toList()) + "]}";
        mvc.perform(post("/api/survey/result").contentType("application/json").content(body)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("comparable"))
                .andExpect(jsonPath("$.method").value("clr_nearest"))
                .andExpect(jsonPath("$.rankings.length()").value(6))
                .andExpect(jsonPath("$.rankings[0].ageGroup").value("30s"))
                .andExpect(jsonPath("$.rankings[0].distance").value(3.857))
                .andExpect(jsonPath("$.peerComparison.more[0].relativeRatio").value(4.53))
                .andExpect(jsonPath("$.peerComparison.more[0].userValue").doesNotExist())
                .andExpect(jsonPath("$.nextAction").isEmpty());
    }

    @Test void insufficientResultHasNullsAndExploreAction() throws Exception {
        mvc.perform(post("/api/survey/result").contentType("application/json").content("{\"answers\":[{\"questionId\":\"q01\",\"status\":\"answered\",\"value\":3}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("insufficient"))
                .andExpect(jsonPath("$.reasonCode").value("too_few_items"))
                .andExpect(jsonPath("$.rankings").isEmpty()).andExpect(jsonPath("$.nearTie").isEmpty())
                .andExpect(jsonPath("$.nextAction.path").value("/explore"));
    }

    @Test void signalsEndpointFiltersAndValidates() throws Exception {
        mvc.perform(get("/api/explore/signals?month=2025-04&ageGroup=50s&dataset=signals")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("available"))
                .andExpect(jsonPath("$.ageGroup.id").value("50s"))
                .andExpect(jsonPath("$.signals.length()").value(2))
                .andExpect(jsonPath("$.signals[0].minorCode").value("aaa"));
        mvc.perform(get("/api/explore/signals?month=2025-04&limit=x&dataset=signals")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_LIMIT"));
    }

    @Test void errorsUseStatusCodeMessageBody() throws Exception {
        mvc.perform(get("/api/explore/signals")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400)).andExpect(jsonPath("$.code").value("MISSING_PARAMETER")).andExpect(jsonPath("$.message").exists());
        mvc.perform(get("/api/profiles?month=2025-13")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_MONTH"));
        mvc.perform(get("/api/profiles/trend")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MISSING_PARAMETER"));
        mvc.perform(get("/api/profiles/trend?minor=none")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_MINOR"));
        mvc.perform(get("/api/meta?dataset=missing")).andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404)).andExpect(jsonPath("$.code").value("DATASET_NOT_FOUND"));
        mvc.perform(post("/api/survey/result").contentType("application/json").content("{\"answers\":[")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_JSON"));
        mvc.perform(post("/api/survey/result").contentType("application/json").content("{\"answers\":[{\"questionId\":\"q01\",\"status\":\"answered\",\"value\":9}]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_VALUE"));
        when(questions.available()).thenReturn(false);
        mvc.perform(get("/api/survey/questions")).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("SURVEY_UNAVAILABLE"));
    }
}
