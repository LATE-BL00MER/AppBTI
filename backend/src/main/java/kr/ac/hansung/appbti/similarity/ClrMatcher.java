package kr.ac.hansung.appbti.similarity;

import kr.ac.hansung.appbti.profile.ApiException;
import kr.ac.hansung.appbti.profile.ProfileData;
import kr.ac.hansung.appbti.survey.SurveyQuestions;
import kr.ac.hansung.appbti.survey.SurveyRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/** API v2 설문 매칭(4-2). 답한 문항만으로 사용자·연령대를 CLR한 뒤 유클리드 거리로 비교하는 결정적 순수 함수다. */
public final class ClrMatcher {
    private ClrMatcher() {}

    public record Ranking(String ageGroup, String label, int rank, double distance, boolean isTied) {}
    public record NearTie(boolean isNear, ProfileData.AgeGroup second, double gapRatio) {}
    public record Evidence(String questionId, String minorCode, String name, String metric, double userValue,
                           Double groupValue, String unit, double difference, String direction, double relativeRatio,
                           double userRelative, double groupRelative,
                           Integer userChoice, String userLabel, Integer groupChoice, String groupLabel) {}
    public record Excluded(String questionId, String minorCode, String name, String reason) {}
    public record PeerItem(String questionId, String minorCode, String name, String metric, double relativeRatio, String message) {}
    public record Suggestion(String questionId, String message) {}
    public record Peer(ProfileData.AgeGroup ageGroup, int comparedItems, List<PeerItem> more, List<PeerItem> less,
                       Suggestion suggestion, boolean matchesStated, String statedDiffers, String note) {}
    public record ResultType(String name, String description, String status) {}
    public record NextAction(String path, String label, String message) {}
    public record Result(String status, String reasonCode, String reason, String method, List<String> referenceMonths,
                         int answeredCount, int comparedItems, int minimumItems, List<Ranking> rankings,
                         List<ProfileData.AgeGroup> matches, NearTie nearTie, String patternClarity,
                         ProfileData.AgeGroup evidenceGroup, Double overallRatio, String closestMode, List<Evidence> closest, List<Evidence> farthest,
                         PatternMap.Layout patternMap,
                         List<Excluded> excluded, Peer peerComparison, ResultType resultType, NextAction nextAction,
                         boolean isMock, String source) {}

    private static final Set<String> STATUSES = Set.of("answered", "not_used", "unknown", "skipped");
    private static final ResultType PENDING = new ResultType(null, null, "pending");
    private static final NextAction EXPLORE = new NextAction("/explore", "세대별 탐색 보기", "연령대별 이용 특성을 둘러볼 수 있어요.");

    private record Used(SurveyQuestions.Question question, ProfileData.Minor minor, double input, double userValue,
                        ProfileData.ReferenceItem reference, int choice) {}

    // 응답을 검사하고 6개 연령대와의 거리 순위·근거·또래 비교를 만든다.
    public static Result calculate(ProfileData data, SimilaritySettings settings, List<SurveyQuestions.Question> questions,
                                   int timeChoiceCount, PeerMessages peer, SurveyRequest request) {
        return calculate(data, settings, questions, Collections.nCopies(timeChoiceCount, (String) null), peer, request);
    }

    // 시간 문항 근거를 선택지 문구로도 보여 주기 위해 선택지 문구 목록을 받는다.
    public static Result calculate(ProfileData data, SimilaritySettings settings, List<SurveyQuestions.Question> questions,
                                   List<String> timeChoices, PeerMessages peer, SurveyRequest request) {
        int timeChoiceCount = timeChoices.size();
        var meta = data.meta();
        var ages = meta.ageGroups();
        ProfileData.AgeGroup stated = request.ageGroup() == null ? null : ages.stream().filter(a -> a.id().equals(request.ageGroup())).findFirst()
                .orElseThrow(() -> ApiException.badRequest("INVALID_AGE_GROUP", "제공하지 않는 연령대입니다."));
        Map<String, SurveyRequest.Answer> answers = validate(request, questions, settings, timeChoiceCount);
        int answered = (int) answers.values().stream().filter(a -> "answered".equals(a.status())).count();
        var reference = data.surveyReference();
        List<String> months = reference == null || reference.months().isEmpty() ? List.of(meta.months().getFirst(), meta.latestMonth())
                : List.of(reference.months().getFirst(), reference.months().getLast());
        int minimum = settings.minimum_items() == null ? 0 : settings.minimum_items();
        if (!settings.enabled() || reference == null) {
            return insufficient(data, months, answered, 0, minimum, List.of(), "comparison_disabled",
                    "비교 방식이 아직 확정되지 않았습니다. 세대별 탐색을 이용해 주세요.");
        }

        Map<String, ProfileData.Minor> minors = new HashMap<>();
        meta.minorCategories().forEach(m -> minors.put(m.code(), m));
        List<Used> used = new ArrayList<>();
        List<Excluded> excluded = new ArrayList<>();
        for (var question : questions) {
            var minor = minors.get(question.minor_code());
            var answer = answers.get(question.id());
            String status = answer == null || "skipped".equals(answer.status()) ? "unknown" : answer.status();
            if (!"answered".equals(status)) {
                excluded.add(new Excluded(question.id(), minor.code(), minor.name(), status));
                continue;
            }
            var item = reference.find(question.minor_code(), question.metric());
            if (item == null || ages.stream().anyMatch(a -> item.values().get(a.id()) == null || item.values().get(a.id()).logMean() == null)) {
                excluded.add(new Excluded(question.id(), minor.code(), minor.name(), "group_missing"));
                continue;
            }
            int value = answer.value().intValue();
            boolean days = "days".equals(question.metric());
            double input = days ? value / settings.days_scale() : settings.time_choice_minutes().get(value - 1);
            used.add(new Used(question, minor, input, days ? value : input, item, (int) value));
        }
        if (used.size() < minimum) {
            return insufficient(data, months, answered, used.size(), minimum, excluded, "too_few_items",
                    "비교할 수 있는 문항이 " + used.size() + "개라 최소 " + minimum + "개보다 적어요.");
        }

        double[] userLog = used.stream().mapToDouble(u -> Math.log(u.input())).toArray();
        double[] user = center(userLog);
        double[][] group = new double[ages.size()][];
        double[] distance = new double[ages.size()];
        for (int a = 0; a < ages.size(); a++) {
            String id = ages.get(a).id();
            group[a] = center(used.stream().mapToDouble(u -> u.reference().values().get(id).logMean()).toArray());
            double sum = 0;
            for (int i = 0; i < user.length; i++) sum += Math.pow(user[i] - group[a][i], 2);
            distance[a] = round(Math.sqrt(sum), 3);
        }

        Integer[] order = new Integer[ages.size()];
        for (int a = 0; a < order.length; a++) order[a] = a;
        Arrays.sort(order, Comparator.comparingDouble((Integer a) -> distance[a]).thenComparingInt(a -> a));
        List<Ranking> rankings = new ArrayList<>();
        for (int i = 0; i < order.length; i++) {
            int a = order[i];
            int rank = i > 0 && distance[order[i - 1]] == distance[a] ? rankings.get(i - 1).rank() : i + 1;
            long same = Arrays.stream(distance).filter(d -> d == distance[a]).count();
            rankings.add(new Ranking(ages.get(a).id(), ages.get(a).label(), rank, distance[a], same > 1));
        }
        List<ProfileData.AgeGroup> matches = Arrays.stream(order).filter(a -> distance[a] == distance[order[0]]).map(ages::get).toList();
        double first = distance[order[0]], second = distance[order[1]];
        double gap = second == 0 ? 0 : (second - first) / second;
        var nearTie = new NearTie(gap < settings.near_tie_ratio(), ages.get(order[1]), round(gap, 3));
        double max = Arrays.stream(distance).max().orElse(0), min = Arrays.stream(distance).min().orElse(0);
        String clarity = settings.flat_pattern_ratio() == null || (max > 0 && (max - min) / max >= settings.flat_pattern_ratio()) ? "clear" : "weak";

        // 근거(가까운·먼 항목)는 사용자가 연령대를 고르면 그 연령대와, 고르지 않으면 1위 연령대와 비교한다. 순위·1위는 그대로다.
        int best = stated != null ? ages.indexOf(stated) : order[0];
        var evidenceGroup = ages.get(best);
        // 근거 집단 대비 응답 전체의 크기(기하평균 배수). CLR에서 빼낸 공통 배수를 화면에 알리는 용도다.
        double groupLogMean = used.stream().mapToDouble(u -> u.reference().values().get(evidenceGroup.id()).logMean()).average().orElse(0);
        double overallRatio = round(Math.exp(Arrays.stream(userLog).average().orElse(0) - groupLogMean), 2);
        // 점 두 개 표시용 기준: 일수·시간은 단위가 달라 CLR 값이 크게 벌어지므로, 같은 지표 안에서 근거 연령대 평균을 가운데로 둔다.
        // 두 점에서 같은 값을 빼므로 두 점 사이 거리(판정 기준)는 그대로다.
        Map<String, Double> offset = new HashMap<>();
        for (String metric : List.of("days", "time")) {
            int b0 = best;
            var values = java.util.stream.IntStream.range(0, used.size()).filter(i -> metric.equals(used.get(i).question().metric()))
                    .mapToDouble(i -> group[b0][i]).toArray();
            offset.put(metric, Arrays.stream(values).average().orElse(0));
        }
        List<Evidence> evidence = new ArrayList<>();
        for (int i = 0; i < used.size(); i++) {
            var u = used.get(i);
            double difference = Math.abs(user[i] - group[best][i]);
            String direction = difference < settings.similar_difference() ? "similar" : user[i] > group[best][i] ? "more" : "less";
            boolean days = "days".equals(u.question().metric());
            Double display = u.reference().values().get(evidenceGroup.id()).display();
            evidence.add(new Evidence(u.question().id(), u.minor().code(), u.minor().name(), u.question().metric(), u.userValue(),
                    u.reference().values().get(evidenceGroup.id()).display(), days ? "일" : "분", difference, direction,
                    Math.exp(user[i] - group[best][i]), Math.exp(user[i] - offset.get(u.question().metric())),
                    Math.exp(group[best][i] - offset.get(u.question().metric())),
                    days ? null : u.choice(), days ? null : timeChoices.get(u.choice() - 1),
                    days ? null : groupChoice(display, settings.time_choice_edges()),
                    days || groupChoice(display, settings.time_choice_edges()) == null ? null
                            : timeChoices.get(groupChoice(display, settings.time_choice_edges()) - 1)));
        }
        // 가까운 항목은 상대 비중(CLR 차이)이 작은 절반 안에 있고, 화면의 일수·시간도 close_value_ratio배 안인 항목만 고른다.
        // 그런 항목이 없으면 CLR 차이가 작은 순서로 고르되 closestMode=values로 알려 화면이 '항목별 이용 수치'로 보여 주게 한다.
        double closeRatio = settings.close_value_ratio() == null ? 1.25 : settings.close_value_ratio();
        Comparator<Evidence> byDifference = Comparator.comparingDouble(Evidence::difference).thenComparing(Evidence::questionId);
        var closerHalf = evidence.stream().sorted(byDifference).limit((evidence.size() + 1) / 2).toList();
        var bothClose = closerHalf.stream().filter(e -> valueClose(e, closeRatio)).limit(3).toList();
        String closestMode = bothClose.isEmpty() ? "values" : "similar";
        var closest = bothClose.isEmpty() ? evidence.stream().sorted(byDifference).limit(3).toList() : bothClose;
        var closeIds = closest.stream().map(Evidence::questionId).toList();
        var farthest = evidence.stream().filter(e -> !closeIds.contains(e.questionId()))
                .sorted(Comparator.comparingDouble(Evidence::difference).reversed().thenComparing(Evidence::questionId)).limit(3).toList();

        Peer peerComparison = stated == null || peer == null ? null
                : peer(peer, stated, used, user, group[ages.indexOf(stated)], matches);
        return new Result("comparable", null, null, SimilaritySettings.CLR_NEAREST, months, answered, used.size(), minimum,
                rankings, matches, nearTie, clarity, evidenceGroup, overallRatio, closestMode, rounded(closest), rounded(farthest), map(user, group, ages), excluded,
                peerComparison, PENDING, null, meta.isMock(), meta.source());
    }

    // 문항 ID·상태·값 형식을 검사하고 문항 ID별 응답을 돌려준다.
    private static Map<String, SurveyRequest.Answer> validate(SurveyRequest request, List<SurveyQuestions.Question> questions,
                                                              SimilaritySettings settings, int timeChoiceCount) {
        if (request.answers() == null) throw ApiException.badRequest("MISSING_PARAMETER", "answers 목록이 필요합니다.");
        Map<String, SurveyQuestions.Question> byId = new HashMap<>();
        questions.forEach(q -> byId.put(q.id(), q));
        Map<String, SurveyRequest.Answer> answers = new LinkedHashMap<>();
        for (var answer : request.answers()) {
            if (answer == null || answer.questionId() == null || !byId.containsKey(answer.questionId())) {
                throw ApiException.badRequest("UNKNOWN_QUESTION", "없거나 사용하지 않는 설문 문항입니다: " + (answer == null ? null : answer.questionId()));
            }
            if (answers.putIfAbsent(answer.questionId(), answer) != null) {
                throw ApiException.badRequest("DUPLICATE_QUESTION", "같은 문항에 두 번 응답했습니다: " + answer.questionId());
            }
            if (answer.status() == null || !STATUSES.contains(answer.status())) {
                throw ApiException.badRequest("INVALID_STATUS", "status는 answered, not_used, unknown 중 하나여야 합니다: " + answer.questionId());
            }
            boolean days = "days".equals(byId.get(answer.questionId()).metric());
            int max = days ? (int) Math.round(settings.days_scale() == null ? 7 : settings.days_scale()) : timeChoiceCount;
            Double value = answer.value();
            if ("answered".equals(answer.status())) {
                if (value == null || !Double.isFinite(value) || value != Math.rint(value) || value < 1 || value > max) {
                    throw ApiException.badRequest("INVALID_VALUE", answer.questionId() + " 응답 값은 1~" + max + " 사이 정수여야 합니다.");
                }
            } else if (value != null) {
                throw ApiException.badRequest("INVALID_VALUE", answer.questionId() + "은 answered가 아니므로 value가 null이어야 합니다.");
            }
        }
        return answers;
    }

    // 고른 연령대와 문항별 상대 배수를 비교해 더·덜 치우친 문항과 제안 문장을 만든다.
    private static Peer peer(PeerMessages config, ProfileData.AgeGroup stated, List<Used> used, double[] user, double[] group,
                             List<ProfileData.AgeGroup> matches) {
        List<double[]> scored = new ArrayList<>();
        for (int i = 0; i < used.size(); i++) scored.add(new double[]{i, user[i] - group[i]});
        Comparator<double[]> strongest = Comparator.comparingDouble((double[] s) -> -Math.abs(s[1]))
                .thenComparing(s -> used.get((int) s[0]).question().id());
        List<PeerItem> more = new ArrayList<>(), less = new ArrayList<>();
        for (var s : scored.stream().sorted(strongest).toList()) {
            var u = used.get((int) s[0]);
            double ratio = round(Math.exp(s[1]), 2);
            Map<String, String> values = Map.of("age", stated.label(), "name", u.minor().name());
            if (ratio >= config.more_ratio() && more.size() < config.max_items()) {
                more.add(new PeerItem(u.question().id(), u.minor().code(), u.minor().name(), u.question().metric(), ratio, PeerMessages.fill(config.templates().more(), values)));
            } else if (ratio <= config.less_ratio() && less.size() < config.max_items()) {
                less.add(new PeerItem(u.question().id(), u.minor().code(), u.minor().name(), u.question().metric(), ratio, PeerMessages.fill(config.templates().less(), values)));
            }
        }
        Suggestion suggestion = more.stream()
                .filter(m -> config.categories().containsKey(m.minorCode()) && config.categories().get(m.minorCode()).suggest_reduce()
                        && config.categories().get(m.minorCode()).reduce() != null)
                .max(Comparator.comparingDouble(PeerItem::relativeRatio).thenComparing(PeerItem::questionId, Comparator.reverseOrder()))
                .map(m -> new Suggestion(m.questionId(), config.categories().get(m.minorCode()).reduce())).orElse(null);
        boolean matchesStated = matches.contains(stated);
        // 매칭 1위(공동이면 모두)에 고른 연령대가 없으면 서버가 안내 문장을 채운다. 템플릿이 없으면 null.
        String statedDiffers = matchesStated || config.templates().stated_differs() == null ? null
                : PeerMessages.fill(config.templates().stated_differs(), Map.of("age", stated.label(),
                        "match", String.join("·", matches.stream().map(ProfileData.AgeGroup::label).toList())));
        return new Peer(stated, used.size(), more, less, suggestion, matchesStated, statedDiffers,
                PeerMessages.fill(config.templates().note(), Map.of("age", stated.label())));
    }

    // 비교 불가 응답을 만든다. 순위·근거는 비우고 0으로 채우지 않는다.
    private static Result insufficient(ProfileData data, List<String> months, int answered, int compared, int minimum,
                                       List<Excluded> excluded, String code, String reason) {
        return new Result("insufficient", code, reason, SimilaritySettings.CLR_NEAREST, months, answered, compared, minimum,
                List.of(), List.of(), null, null, null, null, null, List.of(), List.of(), null, excluded, null, PENDING, EXPLORE,
                data.meta().isMock(), data.meta().source());
    }

    // 값들에서 평균을 빼 중심화한다(로그값이면 CLR).
    private static double[] center(double[] values) {
        double mean = Arrays.stream(values).average().orElse(0);
        return Arrays.stream(values).map(v -> v - mean).toArray();
    }

    // 근거 항목의 차이를 화면용 소수 2자리로 반올림한다.
    private static List<Evidence> rounded(List<Evidence> items) {
        return items.stream().map(e -> new Evidence(e.questionId(), e.minorCode(), e.name(), e.metric(), e.userValue(), e.groupValue(),
                e.unit(), round(e.difference(), 2), e.direction(), round(e.relativeRatio(), 2),
                round(e.userRelative(), 2), round(e.groupRelative(), 2), e.userChoice(), e.userLabel(), e.groupChoice(), e.groupLabel())).toList();
    }

    // 나와 6개 연령대의 CLR 패턴으로 2차원 응답 패턴 지도를 만든다.
    private static PatternMap.Layout map(double[] user, double[][] group, List<ProfileData.AgeGroup> ages) {
        double[][] rows = new double[ages.size() + 1][];
        rows[0] = user;
        System.arraycopy(group, 0, rows, 1, ages.size());
        List<String> ids = new ArrayList<>(List.of("me")), labels = new ArrayList<>(List.of("나"));
        ages.forEach(a -> { ids.add(a.id()); labels.add(a.label()); });
        return PatternMap.build(rows, ids, labels);
    }

    // 집단 시간(분)이 몇 번째 선택지 구간인지 돌려준다. 경계 설정이 없으면 null.
    private static Integer groupChoice(Double minutes, List<Double> edges) {
        if (minutes == null || edges == null) return null;
        int choice = 1;
        for (double edge : edges) if (minutes >= edge) choice++;
        return choice;
    }

    // 화면에 보이는 내 값과 집단 값이 ratio배 안에 있는지 본다. 집단 값이 없으면 가깝다고 보지 않는다.
    private static boolean valueClose(Evidence e, double ratio) {
        if (e.groupValue() == null || e.groupValue() <= 0 || e.userValue() <= 0) return false;
        double r = e.userValue() / e.groupValue();
        return r <= ratio && r >= 1 / ratio;
    }

    // 소수 자릿수에 맞춰 반올림(HALF_UP)한다.
    private static double round(double value, int scale) {
        return BigDecimal.valueOf(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
    }
}
