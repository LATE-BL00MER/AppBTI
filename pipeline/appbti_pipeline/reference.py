"""설문 매칭 기준값(surveyReference)과 이 달의 특이 신호(monthlySignals). profiles 행만 입력으로 쓴다."""

import calendar
import math

METRICS = ("days", "time")


def _log_values(rows: list[dict], months: list[str], metric: str) -> list[float] | None:
    """월 순서대로 로그값. 한 달이라도 없거나 0 이하이면 None (0으로 채우지 않는다)."""
    by_month = {r["month"]: r for r in rows}
    values = []
    for month in months:
        row = by_month.get(month)
        if row is None:
            return None
        if metric == "days":
            value = row["avgDays"]
            value = None if value is None else value / calendar.monthrange(int(month[:4]), int(month[5:]))[1]
        else:
            value = row["avgDailyTime"]
        if value is None or value <= 0:
            return None
        values.append(math.log(value))
    return values


def _groups(profiles: list[dict]) -> dict:
    groups = {}
    for row in profiles:
        groups.setdefault((row["minorCode"], row["ageGroup"]), []).append(row)
    return groups


def build_survey_reference(profiles: list[dict], meta: dict) -> dict:
    """분류 × 지표 × 연령대의 월별 로그값 평균. Spring은 응답한 문항으로 다시 중심화(CLR)만 한다."""
    months, ages = meta["months"], [a["id"] for a in meta["ageGroups"]]
    metrics = ["days"] + (["time"] if meta["metrics"]["dailyTime"] else [])
    groups = _groups(profiles)
    items = []
    for minor in meta["minorCategories"]:
        for metric in metrics:
            values = {}
            for age in ages:
                logs = _log_values(groups.get((minor["code"], age), []), months, metric)
                if logs is None:
                    values[age] = None
                    continue
                log_mean = sum(logs) / len(logs)
                # 화면용 값: days는 "일주일에 며칠"(비율 × 7), time은 분. 둘 다 기하평균이다.
                display = math.exp(log_mean) * (7 if metric == "days" else 1)
                values[age] = {"logMean": round(log_mean, 6), "display": round(display, 4)}
            items.append({"minorCode": minor["code"], "metric": metric, "values": values})
    return {"months": months, "items": items}


def build_monthly_signals(profiles: list[dict], meta: dict, rule: dict | None) -> dict | None:
    """나머지 달 평균 대비 변화가 평소 흔들림보다 확실히 큰 칸. 기준값은 코드북 monthly_signals에서 읽는다."""
    if not rule or not rule.get("enabled"):
        return None
    months, ages = meta["months"], [a["id"] for a in meta["ageGroups"]]
    if len(months) < 3:
        return None
    metrics = [m for m in rule["metrics"] if m == "days" or meta["metrics"]["dailyTime"]]
    min_log, gen_log = math.log(rule["min_ratio"]), math.log(rule["generation_min_ratio"])
    # 처음·끝 달은 한쪽 달들하고만 비교돼 완만한 변화도 잡히므로 더 큰 변화만 신호로 본다.
    edge_log = math.log(rule.get("edge_min_ratio", rule["min_ratio"]))
    edges = {months[0], months[-1]}
    groups = _groups(profiles)
    items = []
    for minor in meta["minorCategories"]:
        for metric in metrics:
            changes = {}  # 연령대 → 월별 (변화, 흔들림)
            for age in ages:
                logs = _log_values(groups.get((minor["code"], age), []), months, metric)
                if logs is None:
                    continue
                per_month = []
                for i in range(len(months)):
                    others = logs[:i] + logs[i + 1:]
                    mean = sum(others) / len(others)
                    spread = math.sqrt(sum((v - mean) ** 2 for v in others) / (len(others) - 1))
                    per_month.append((logs[i] - mean, max(spread, rule["min_std"])))
                changes[age] = per_month
            if not changes:
                continue
            for i, month in enumerate(months):
                # 공통 변화는 6개 연령대가 모두 있을 때만 계산한다. 일부가 빠지면 세대 신호를 판정하지 않는다.
                common = sum(c[i][0] for c in changes.values()) / len(changes) if len(changes) == len(ages) else None
                for age, per_month in changes.items():
                    delta, spread = per_month[i]
                    z = abs(delta) / spread
                    if abs(delta) < (edge_log if month in edges else min_log) or z < rule["min_z"]:
                        continue
                    kind = "generation" if common is not None and abs(delta - common) >= gen_log else "market"
                    items.append({"month": month, "ageGroup": age, "minorCode": minor["code"], "metric": metric,
                                  "direction": "up" if delta > 0 else "down", "ratio": round(math.exp(delta), 2),
                                  "z": round(z, 1), "type": kind, "isEdgeMonth": month in edges})
    items.sort(key=lambda s: (s["month"], s["ageGroup"], -s["z"], -abs(math.log(s["ratio"])), s["minorCode"], s["metric"]))
    return {"status": rule.get("status", "draft"),
            "rule": {"minRatio": rule["min_ratio"], "minZ": rule["min_z"], "generationMinRatio": rule["generation_min_ratio"],
                     "minStd": rule["min_std"], "edgeMinRatio": rule.get("edge_min_ratio", rule["min_ratio"]),
                     "edgeMonthPolicy": "stricter_and_flag"},
            "items": items}
