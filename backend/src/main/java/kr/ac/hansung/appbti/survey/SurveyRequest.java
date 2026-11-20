package kr.ac.hansung.appbti.survey;

import java.util.List;

/** 설문 응답 요청. v1(목업)은 minorCode·days·minutes, API v2는 questionId·status·value와 선택 입력 ageGroup을 쓴다. */
public record SurveyRequest(String month, String ageGroup, List<Answer> answers) {
    public record Answer(String minorCode, Double days, Double minutes, String questionId, String status, Double value) {
        // v1 형식 응답 하나를 만든다.
        public Answer(String minorCode, Double days, Double minutes) { this(minorCode, days, minutes, null, null, null); }
    }

    // v1 형식 요청을 만든다.
    public SurveyRequest(String month, List<Answer> answers) { this(month, null, answers); }
}
