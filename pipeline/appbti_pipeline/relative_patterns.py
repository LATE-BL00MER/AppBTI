"""이용일 비율·이용시간의 CLR과 연령대 기준 배수를 계산한다."""

from calendar import monthrange
from math import exp, inf, log

import pandas as pd


STABLE_HIGH = 1.2
STABLE_LOW = 0.83
NEAR_TIE = 0.05


def distance_gap_ratio(first, second):
    """차순위 거리 중 1·2위 간격이 차지하는 비율을 구한다."""
    return (second - first) / second if second else 0.0


def days_in_month(month):
    year, month_number = map(int, month.split("-"))
    return monthrange(year, month_number)[1]


def joint_clr(days, minutes):
    month_lengths = days.index.get_level_values("month").map(days_in_month)
    common = (days.gt(0) & days.le(month_lengths, axis="index") & minutes.gt(0) & minutes.lt(inf)).all()
    ratio = days.loc[:, common].div(month_lengths, axis="index")
    logs = pd.concat({"days": ratio, "time": minutes.loc[:, common]}, axis=1).map(log)
    return logs.sub(logs.mean(axis="columns"), axis="index")


def center_by_age(clr):
    """같은 월·중분류·지표에서 연령대 평균 CLR을 뺀다."""
    return clr - clr.groupby(level="month").transform("mean")


def multiplier_lookup(centered, metric):
    if centered.empty:
        return {}
    return {(month, age, code): exp(value)
            for (month, age), row in centered[metric].iterrows() for code, value in row.items()}
