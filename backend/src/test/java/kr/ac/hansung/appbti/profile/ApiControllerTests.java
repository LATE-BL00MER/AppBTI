package kr.ac.hansung.appbti.profile;

import kr.ac.hansung.appbti.similarity.SimilarityCalculatorTests;
import kr.ac.hansung.appbti.similarity.SimilaritySettings;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ApiController.class)
class ApiControllerTests {
    @Autowired MockMvc mvc;
    @MockitoBean ProfileRepository repository;
    @MockitoBean SimilaritySettings.Loader settings;

    @BeforeEach void prepare() {
        var data = SimilarityCalculatorTests.fixture(false);
        when(repository.get("basic")).thenReturn(data);
        when(repository.availableDatasets()).thenReturn(java.util.List.of("basic"));
        when(repository.month(eq(data), nullable(String.class))).thenAnswer(call -> call.getArgument(1) == null ? "2025-06" : call.getArgument(1));
        when(settings.forData(true)).thenReturn(SimilarityCalculatorTests.settings(4));
    }

    @Test void metadataAndQuestionsDescribeAvailableData() throws Exception {
        mvc.perform(get("/api/meta")).andExpect(status().isOk()).andExpect(jsonPath("$.isMock").value(true)).andExpect(jsonPath("$.metrics.dailyTime").value(false));
        mvc.perform(get("/api/survey/questions")).andExpect(status().isOk()).andExpect(jsonPath("$.questions.length()").value(6)).andExpect(jsonPath("$.timeAvailable").value(false));
    }

    @Test void profilesPreserveNullAndTrendUsesSameContract() throws Exception {
        mvc.perform(get("/api/profiles")).andExpect(status().isOk()).andExpect(jsonPath("$.profiles.length()").value(36)).andExpect(jsonPath("$.profiles[0].ageShare").isEmpty());
        mvc.perform(get("/api/profiles/trend?minor=c0")).andExpect(status().isOk()).andExpect(jsonPath("$.profiles.length()").value(6));
        mvc.perform(get("/api/profiles/trend?minor=unknown")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
    }

    @Test void insufficientAndInvalidAnswersHaveDifferentResponses() throws Exception {
        mvc.perform(post("/api/survey/result").contentType("application/json").content("{\"answers\":[]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("insufficient")).andExpect(jsonPath("$.scores").isEmpty());
        mvc.perform(post("/api/survey/result").contentType("application/json").content("{\"answers\":[{\"minorCode\":\"c0\",\"days\":-1}]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
    }
}
