package kr.ac.hansung.appbti.profile;

import kr.ac.hansung.appbti.similarity.SimilaritySettings;
import kr.ac.hansung.appbti.survey.SurveyQuestions;
import org.springframework.stereotype.Component;

/** /meta.survey의 설문 요약(홈 화면 소개 문구용). 실제 데이터는 config/survey_questions.yaml에서 제공할 문항을 센다. */
@Component
public class SurveySummary {
    private final SurveyQuestions questions;

    // 설문 문항 설정을 받아 요약을 만든다.
    public SurveySummary(SurveyQuestions questions) { this.questions = questions; }

    public record Summary(Integer questionCount, String period, String method, Boolean timeAvailable) {
        // timeAvailable 없이 요약을 만든다(v1 호환).
        public Summary(Integer questionCount, String period, String method) { this(questionCount, period, method, null); }
    }

    // v1 방식(목업 이전 설정)은 중분류 전체가 문항이고, v2는 데이터별 문항 설정에서 제공 가능한 문항 수·기간·시간 문항 사용 여부를 돌려준다.
    public Summary forData(ProfileData.Meta meta, String method) {
        if (meta.isMock() && !SimilaritySettings.CLR_NEAREST.equals(method))
            return new Summary(meta.minorCategories().size(), "monthly", method, meta.metrics().timeComparable());
        var questions = this.questions.forData(meta.isMock());
        if (!questions.available()) return new Summary(null, null, method, false);
        var served = questions.served(meta);
        return new Summary(served.size(), questions.period(), method, served.stream().anyMatch(q -> "time".equals(q.metric())));
    }
}
