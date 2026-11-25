"""가상 월간 집계로 기준 서비스 대비 구성비를 검증한다."""

from pathlib import Path

from appbti_pipeline.adapter import load_codebook, read_source
from appbti_pipeline.insights import analyze
from appbti_pipeline.profile import build_profiles


ROOT = Path(__file__).resolve().parents[2]


def test_composition_index_on_mock():
    book = load_codebook(ROOT / "config" / "codebook.mock.yaml")
    frame = read_source(ROOT / "data" / "mock" / "with_time", book)
    ages = "ABCDEF"
    months = [f"2025-{month:02d}" for month in range(1, 7)]
    january = frame["month"].eq(months[0])
    for code, counts in [("message", [4, 2, 1, 1, 1, 1]), ("video", [2, 4, 1, 1, 1, 1])]:
        selected = january & frame["minor_code"].eq(code)
        frame.loc[selected, "uu"] = frame.loc[selected, "age_group"].map(dict(zip(ages, map(str, counts))))
        frame.loc[selected, "status"] = "normal"
    reference_a = frame["minor_code"].eq("message") & frame["age_group"].eq("A")
    frame.loc[reference_a & frame["month"].eq(months[1]), ["status", "uu"]] = ["normal", "0"]
    frame.loc[reference_a & frame["month"].eq(months[2]), "status"] = "suppressed"

    profiles = build_profiles(frame, book, {"rowCount": len(frame), "warnings": []})
    assert profiles["meta"]["compositionIndexReference"]["minorCode"] == "message"
    rows = {(row["month"], row["ageGroup"], row["minorCode"]): row for row in profiles["profiles"]}
    assert rows[months[0], "A", "video"]["ageShareIndex"] == 0.5
    assert rows[months[0], "B", "video"]["ageShareIndex"] == 2
    assert rows[months[0], "A", "message"]["ageShareIndex"] == 1
    assert rows[months[1], "A", "video"]["ageShareIndex"] is None
    assert rows[months[2], "B", "video"]["ageShareIndex"] is None
    assert rows[months[0], "B", "video"]["ageShare"] == 0.4

    for metric in ("uu", "avg_days", "avg_daily_time"):
        frame[metric] = frame[metric].replace({None: float("nan")}).astype(float)
        frame.loc[frame["status"].ne("normal"), metric] = float("nan")
    points = analyze(frame, book, months)["composition_index"]["points"]
    values = {(row["month"], row["age_group"], row["minor_code"]): row["index"] for row in points}
    assert values[months[0], "B", "video"] == 2
    assert values[months[2], "B", "video"] is None

    book["composition_index"]["reference_minor_code"] = "video"
    switched = build_profiles(frame, book, {"rowCount": len(frame), "warnings": []})
    assert switched["meta"]["compositionIndexReference"]["minorCode"] == "video"
    assert next(row for row in switched["profiles"] if (row["month"], row["ageGroup"], row["minorCode"])
                == (months[0], "A", "message"))["ageShareIndex"] == 2
