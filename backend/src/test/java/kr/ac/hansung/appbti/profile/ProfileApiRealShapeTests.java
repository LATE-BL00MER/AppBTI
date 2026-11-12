package kr.ac.hansung.appbti.profile;

import kr.ac.hansung.appbti.similarity.SimilaritySettings;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 조회·탐색 API를 실제 산출물 구조(가상 값)로 확인한다. 설문 API는 ApiControllerTests가 맡는다. */
@WebMvcTest(ApiController.class)
class ProfileApiRealShapeTests {
    @Autowired MockMvc mvc;
    @MockitoBean ProfileRepository repository;
    @MockitoBean SimilaritySettings.Loader settings;
    @MockitoBean SurveySummary survey;

    private void use(ProfileData data) {
        when(repository.get("basic")).thenReturn(data);
        when(repository.availableDatasets()).thenReturn(java.util.List.of("basic"));
        when(repository.month(eq(data), nullable(String.class))).thenAnswer(call -> {
            String month = call.getArgument(1);
            if (month == null) return "2025-06";
            if (!data.meta().months().contains(month)) throw new IllegalArgumentException("제공하지 않는 기준월입니다.");
            return month;
        });
    }

    @BeforeEach void prepare() {
        use(RealShapeFixture.profiles(false));
        when(settings.forData(false)).thenReturn(new SimilaritySettings(false, "cosine", null, null, null, null, null, null));
        when(survey.forData(any(), eq("cosine"))).thenReturn(new SurveySummary.Summary(12, "monthly", "cosine"));
    }

    @Test void metaDescribesRealShapeAndSurveySummary() throws Exception {
        mvc.perform(get("/api/meta")).andExpect(status().isOk())
                .andExpect(jsonPath("$.isMock").value(false))
                .andExpect(jsonPath("$.ageGroups.length()").value(6))
                .andExpect(jsonPath("$.ageGroups[0].id").value("under20"))
                .andExpect(jsonPath("$.majorCategories.length()").value(14))
                .andExpect(jsonPath("$.metrics.weightedReference").value(false))
                .andExpect(jsonPath("$.availableDatasets.length()").value(1))
                .andExpect(jsonPath("$.survey.questionCount").value(12))
                .andExpect(jsonPath("$.survey.period").value("monthly"))
                .andExpect(jsonPath("$.survey.method").value("cosine"));
    }

    @Test void profilesAndTrendKeepNullForMissingRows() throws Exception {
        mvc.perform(get("/api/profiles")).andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles.length()").value(30))
                .andExpect(jsonPath("$.profiles[?(@.ageGroup=='60plus' && @.minorCode=='m_d')].status").value("missing"))
                .andExpect(jsonPath("$.profiles[?(@.ageGroup=='60plus' && @.minorCode=='m_d')].uu").value(org.hamcrest.Matchers.contains((Object) null)));
        mvc.perform(get("/api/profiles/trend?minor=m_d")).andExpect(status().isOk())
                .andExpect(jsonPath("$.profiles.length()").value(12))
                .andExpect(jsonPath("$.profiles[0].ageShare").isEmpty());
    }

    @Test void rankingDefaultsToAgeShare() throws Exception {
        mvc.perform(get("/api/explore/ranking?ageGroup=20s")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("available"))
                .andExpect(jsonPath("$.basis").value("ageShare"))
                .andExpect(jsonPath("$.month").value("2025-06"))
                .andExpect(jsonPath("$.ageGroup.label").value("20대"))
                .andExpect(jsonPath("$.isMock").value(false))
                .andExpect(jsonPath("$.items[0].minorCode").value("m_b"))
                .andExpect(jsonPath("$.items[1].rank").value(2))
                .andExpect(jsonPath("$.items[2].rank").value(2))
                .andExpect(jsonPath("$.items[0].relativeFrequency").isEmpty())
                .andExpect(jsonPath("$.excluded[0].reason").value("share_unavailable"));
        mvc.perform(get("/api/explore/ranking?ageGroup=20s&major=쇼핑&limit=1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.major").value("쇼핑"));
    }

    @Test void relativeFrequencyFollowsDenominatorFlag() throws Exception {
        mvc.perform(get("/api/explore/ranking?ageGroup=20s&basis=relativeFrequency")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("unavailable"))
                .andExpect(jsonPath("$.reason").isNotEmpty())
                .andExpect(jsonPath("$.items").isEmpty());
        use(RealShapeFixture.profiles(true));
        mvc.perform(get("/api/explore/ranking?ageGroup=20s&basis=relativeFrequency")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("available"))
                .andExpect(jsonPath("$.items[0].value").value(1.5));
    }

    @Test void invalidRankingRequestsReturnMessage400() throws Exception {
        for (String query : java.util.List.of("", "?ageGroup=10s", "?ageGroup=20s&basis=uu", "?ageGroup=20s&major=없음",
                "?ageGroup=20s&limit=0", "?ageGroup=20s&limit=abc", "?ageGroup=20s&month=2024-12")) {
            mvc.perform(get("/api/explore/ranking" + query)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
        }
    }
}
