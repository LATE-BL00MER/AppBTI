"""코드북 기반의 재현 가능한 가상 원본 두 종류를 만든다. 실제 데이터와 무관하다."""

import csv
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def generate() -> None:
    base = yaml.safe_load((ROOT / "config/codebook.yaml").read_text(encoding="utf-8"))
    mock = yaml.safe_load((ROOT / "config/codebook.mock.yaml").read_text(encoding="utf-8"))
    # 항목마다 봉우리가 다른 단순 패턴. 어떤 실제 세대의 특징도 가정하지 않는다.
    peaks = [0, 1, 0, 1, 3, 4, 2, 3, 2, 1, 5, 4]
    for with_time in (False, True):
        folder = ROOT / "data/mock" / ("with_time" if with_time else "basic")
        folder.mkdir(parents=True, exist_ok=True)
        columns = dict(base["columns"])
        if not with_time:
            columns = {k: v for k, v in columns.items() if v not in ("avg_daily_time", "time_unit")}
        with (folder / "mock_usage.csv").open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(columns))
            writer.writeheader()
            for month in range(1, 7):
                for age_index, age in enumerate(mock["age_groups"]):
                    for index, minor in enumerate(mock["minor_categories"]):
                        # 비공개와 누락 사례도 화면에서 확인할 수 있게 포함한다.
                        if month == 3 and age_index == 2 and minor["code"] == "travel":
                            continue
                        hidden = month == 6 and age_index == 5 and minor["code"] == "news"
                        days = max(2, 24 - abs(age_index - peaks[index]) * 4 + (month - 3))
                        values = dict(month=f"2025-{month:02}", age_group=age["id"],
                                      major=minor["major"], minor_code=minor["code"], minor_name=minor["name"],
                                      uu="" if hidden else 100 * (7 - abs(age_index - peaks[index])),
                                      avg_days="" if hidden else days,
                                      avg_daily_time="" if hidden else 10 + (index % 4) * 10 + days,
                                      time_unit="분", status="비공개" if hidden else "정상",
                                      note="가상 중분류·가상 수치. 시연 전용이며 실제 LG U+ 통계와 무관함.")
                        writer.writerow({source: values[target] for source, target in columns.items()})


if __name__ == "__main__":
    generate()
