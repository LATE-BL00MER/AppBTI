package kr.ac.hansung.appbti.survey;

import java.util.List;

public record SurveyRequest(String month, List<Answer> answers) {
    public record Answer(String minorCode, Double days, Double minutes) {}
}
