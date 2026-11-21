"""실행 중인 프로토타입의 실제 API와 Vite 프록시를 검증한다. 외부 서비스는 호출하지 않는다."""

import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

checks = 0


def call(path, body=None, status=200, origin="http://127.0.0.1:5173"):
    global checks
    request = Request(origin + "/api" + path, data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        response = urlopen(request, timeout=10)
    except HTTPError as error:
        response = error
    assert response.status == status, (path, response.status, response.read())
    checks += 1
    return json.load(response)


for dataset, timed in [("basic", False), ("time", True)]:
    suffix = f"?dataset={dataset}"
    meta = call("/meta" + suffix)
    assert meta["isMock"] and meta["metrics"]["dailyTime"] == timed
    assert len(meta["ageGroups"]) == 6
    profiles = call("/profiles" + suffix)["profiles"]
    questions = call("/survey/questions" + suffix)
    assert questions["timeAvailable"] == timed and questions["comparisonEnabled"]
    assert len(questions["questions"]) >= questions["minimumItems"]
    answers = [{"questionId": q["id"], "status": "answered", "value": 3} for q in questions["questions"]]
    result = call("/survey/result" + suffix, {"ageGroup": meta["ageGroups"][2]["id"], "answers": answers})
    assert result["status"] == "comparable" and result["method"] == "clr_nearest" and len(result["rankings"]) == 6
    assert result["comparedItems"] == len(answers) and result["peerComparison"] is not None
    peer = result["peerComparison"]
    assert (peer["statedDiffers"] is None) == peer["matchesStated"]
    assert call("/survey/result" + suffix, {"ageGroup": meta["ageGroups"][2]["id"], "answers": answers}) == result
    assert call("/survey/result" + suffix, {"answers": []})["status"] == "insufficient"
    call("/survey/result" + suffix, {"answers": [{"questionId": answers[0]["questionId"], "status": "answered", "value": 0}]}, 400)
    call("/survey/result" + suffix, {"answers": [answers[0], answers[0]]}, 400)
    call("/survey/result" + suffix, {"answers": [{"questionId": "q99", "status": "answered", "value": 1}]}, 400)
    travel = call(f"/profiles/trend?minor=travel&dataset={dataset}")["profiles"]
    assert any(row["avgDays"] is None and row["status"] == "missing" for row in travel)
    news = [row for row in profiles if row["minorCode"] == "news"]
    assert all(row["ageShare"] is None for row in news)
    assert any(row["status"] == "suppressed" and row["uu"] is None for row in news)
call("/meta?dataset=unknown", status=404)
call("/profiles?month=2099-01", status=400)
call("/profiles/trend?minor=unknown", status=400)
call("/meta", origin="http://127.0.0.1:8080")
print(f"PASS: {checks} live HTTP checks. Both mock datasets, missing data, similarity and proxy verified.")
