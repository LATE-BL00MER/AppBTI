"""surveyReference·monthlySignals 회귀 검증. 모든 값은 직접 만든 가상 값이다."""

import calendar
import math

import pytest

from appbti_pipeline.reference import build_monthly_signals, build_survey_reference

MONTHS = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"]
AGES = ["under20", "20s", "30s", "40s", "50s", "60plus"]
RULE = {"enabled": True, "status": "draft", "metrics": ["days", "time"], "min_ratio": 1.25,
        "min_z": 3.0, "generation_min_ratio": 1.25, "edge_min_ratio": 1.5, "min_std": 0.02}


def meta(daily_time=True):
    return {"months": MONTHS, "ageGroups": [{"id": a, "label": a} for a in AGES],
            "minorCategories": [{"code": "aaa"}, {"code": "bbb"}], "metrics": {"dailyTime": daily_time}}


def profiles(days=None, time=None):
    """기본은 달마다 아주 조금씩 흔들리는 가상 값. days/time으로 (minor, age, month) 값을 덮어쓴다."""
    rows = []
    for m_i, month in enumerate(MONTHS):
        for a_i, age in enumerate(AGES):
            for minor in ("aaa", "bbb"):
                wobble = 1 + 0.01 * ((m_i + a_i) % 3 - 1)
                d = (10 + a_i) * wobble
                t = (20 + 2 * a_i) * wobble
                key = (minor, age, month)
                rows.append({"month": month, "ageGroup": age, "minorCode": minor, "status": "normal",
                             "avgDays": (days or {}).get(key, d), "avgDailyTime": (time or {}).get(key, t)})
    return rows


def item(reference, minor, metric):
    return next(i for i in reference["items"] if i["minorCode"] == minor and i["metric"] == metric)


def test_log_mean_uses_month_days_and_display_units():
    ref = build_survey_reference(profiles(), meta())
    expected_days = sum(math.log(12 * (1 + 0.01 * ((m + 2) % 3 - 1)) / calendar.monthrange(2025, m + 1)[1]) for m in range(6)) / 6  # 30대 기본값 12일
    value = item(ref, "aaa", "days")["values"]["30s"]
    assert value["logMean"] == pytest.approx(expected_days, abs=1e-6)
    assert value["display"] == pytest.approx(math.exp(expected_days) * 7, abs=1e-4)  # 일주일에 며칠
    time_value = item(ref, "aaa", "time")["values"]["30s"]
    assert time_value["display"] == pytest.approx(math.exp(time_value["logMean"]), abs=1e-4)  # 분


def test_missing_or_zero_month_makes_reference_null_not_zero():
    ref = build_survey_reference(profiles(days={("aaa", "40s", "2025-03"): None}, time={("bbb", "20s", "2025-05"): 0.0}), meta())
    assert item(ref, "aaa", "days")["values"]["40s"] is None
    assert item(ref, "bbb", "time")["values"]["20s"] is None
    assert item(ref, "aaa", "days")["values"]["30s"] is not None


def test_time_reference_is_skipped_when_time_metric_is_unavailable():
    ref = build_survey_reference(profiles(), meta(daily_time=False))
    assert {i["metric"] for i in ref["items"]} == {"days"}


def test_recentered_log_mean_equals_mean_of_monthly_clr():
    rows = profiles()
    ref = build_survey_reference(rows, meta())
    cols = [("aaa", "days"), ("aaa", "time"), ("bbb", "days"), ("bbb", "time")]
    for age in AGES:
        g = [item(ref, minor, metric)["values"][age]["logMean"] for minor, metric in cols]
        recentered = [v - sum(g) / len(g) for v in g]
        monthly = []
        for month in MONTHS:
            row = {r["minorCode"]: r for r in rows if r["month"] == month and r["ageGroup"] == age}
            logs = [math.log(row[m]["avgDays"] / calendar.monthrange(2025, int(month[5:]))[1]) if k == "days"
                    else math.log(row[m]["avgDailyTime"]) for m, k in cols]
            monthly.append([v - sum(logs) / len(logs) for v in logs])
        assert recentered == pytest.approx([sum(c) / len(c) for c in zip(*monthly)], abs=1e-5)


def test_single_age_jump_is_generation_signal():
    key = ("aaa", "40s", "2025-04")
    rows = profiles(days={key: 13 * 1.6})  # 40대 기본값 13일의 약 1.6배
    signals = build_monthly_signals(rows, meta(), RULE)["items"]
    assert [(s["month"], s["ageGroup"], s["minorCode"], s["metric"]) for s in signals] == [("2025-04", "40s", "aaa", "days")]
    assert signals[0]["type"] == "generation" and signals[0]["direction"] == "up"
    assert signals[0]["ratio"] == pytest.approx(1.6, abs=0.05) and signals[0]["isEdgeMonth"] is False


def test_all_ages_moving_together_is_market_signal():
    rows = profiles(time={("bbb", age, "2025-03"): (20 + 2 * i) * 0.6 for i, age in enumerate(AGES)})
    signals = build_monthly_signals(rows, meta(), RULE)["items"]
    assert len(signals) == 6 and {s["type"] for s in signals} == {"market"}
    assert {s["direction"] for s in signals} == {"down"}


def test_small_change_is_not_a_signal_and_edge_month_is_flagged():
    assert build_monthly_signals(profiles(days={("aaa", "20s", "2025-04"): 11 * 1.15}), meta(), RULE)["items"] == []
    signals = build_monthly_signals(profiles(days={("aaa", "20s", "2025-06"): 11 * 1.8}), meta(), RULE)["items"]
    assert signals and all(s["isEdgeMonth"] for s in signals)


def test_edge_month_needs_bigger_change_than_middle_month():
    middle = build_monthly_signals(profiles(days={("aaa", "20s", "2025-04"): 11 * 1.35}), meta(), RULE)["items"]
    edge = build_monthly_signals(profiles(days={("aaa", "20s", "2025-06"): 11 * 1.35}), meta(), RULE)["items"]
    assert len(middle) == 1 and edge == []  # 1.35배: 가운데 달은 신호, 처음·끝 달은 1.5배 미만이라 아님
    assert build_monthly_signals(profiles(), meta(), RULE)["rule"]["edgeMinRatio"] == 1.5


def test_missing_month_is_not_judged_and_disabled_rule_outputs_nothing():
    rows = profiles(days={("aaa", "40s", "2025-04"): 13 * 1.6, ("aaa", "40s", "2025-02"): None})
    assert all(s["ageGroup"] != "40s" or s["minorCode"] != "aaa" for s in build_monthly_signals(rows, meta(), RULE)["items"])
    assert build_monthly_signals(profiles(), meta(), None) is None
    assert build_monthly_signals(profiles(), meta(), {**RULE, "enabled": False}) is None


def test_time_signals_are_skipped_without_time_metric_and_output_is_deterministic():
    rows = profiles(time={("aaa", "40s", "2025-04"): 26 * 1.8})
    assert build_monthly_signals(rows, meta(daily_time=False), RULE)["items"] == []
    assert build_monthly_signals(rows, meta(), RULE) == build_monthly_signals(rows, meta(), RULE)
