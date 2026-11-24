"""월별 이용자 수가 충분한 대표 중분류 후보를 고른다."""

from math import inf


EXCLUDED_BELOW_QUANTILE = 0.2
# 분야별 패턴 첫 화면에 먼저 보여 줄 '많이 쓰이는 서비스': 월별 이용자 수 중앙값 상위 25%.
MAJOR_ABOVE_QUANTILE = 0.75


def is_other(name):
    return "기타" in name


def _monthly_medians(users, age_count, month_count):
    # 연령대 6구간은 서로 겹치지 않으므로 같은 중분류·같은 달의 이용자 수는 연령 방향으로 더할 수 있다.
    valid = users.where(users.ge(0) & users.lt(inf))
    monthly_totals = valid.groupby(level="month").sum(min_count=age_count)
    return monthly_totals.loc[:, monthly_totals.count().eq(month_count)].median()


def representative_codes(users, age_count, month_count):
    medians = _monthly_medians(users, age_count, month_count)
    eligible = set(medians.index[medians.gt(0) & medians.ge(medians.quantile(EXCLUDED_BELOW_QUANTILE))])
    return eligible, len(medians)


def major_codes(users, age_count, month_count):
    """월별 이용자 수 중앙값이 상위 25% 이상인 중분류. 모든 달·연령대 값이 있는 중분류만 순위에 넣는다."""
    medians = _monthly_medians(users, age_count, month_count)
    return set(medians.index[medians.gt(0) & medians.ge(medians.quantile(MAJOR_ABOVE_QUANTILE))])
