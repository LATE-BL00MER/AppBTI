package kr.ac.hansung.appbti.similarity;

import java.util.ArrayList;
import java.util.List;

/**
 * 응답 패턴 지도: 나와 6개 연령대의 CLR 패턴(답한 문항 k개)을 2차원으로 줄인 좌표(PCA).
 * 축은 연령대끼리 다른 방향이고, explained는 연령대 차이 중 지도에 담긴 비율이다. 실제 순위는 k차원 거리(ClrMatcher)로 정하고, 지도는 보조 그림이다.
 */
public final class PatternMap {
    private PatternMap() {}

    public record Point(String id, String label, double x, double y, boolean isUser) {}
    public record Layout(List<Point> points, double explained) {}

    // rows[0]은 나, rows[1..]은 연령대 순서. 지도 축은 연령대끼리 다른 방향(연령대 6점의 주성분)으로 잡고 나를 그 위에 투영한다.
    // 나와 모든 연령대에 똑같이 더해지는 차이(연령대 평면 밖 성분)는 순위에 영향이 없으므로 지도에서 뺀다.
    // 좌표는 가장 먼 점이 1이 되도록 맞추고, 축 방향은 마지막 연령대가 오른쪽·첫 연령대가 위쪽이 되게 고정한다.
    public static Layout build(double[][] rows, List<String> ids, List<String> labels) {
        int n = rows.length, g = n - 1, k = rows[0].length;
        double[] mean = new double[k];
        for (int i = 1; i < n; i++) for (int j = 0; j < k; j++) mean[j] += rows[i][j] / g;
        double[][] centered = new double[n][k];
        for (int i = 0; i < n; i++) for (int j = 0; j < k; j++) centered[i][j] = rows[i][j] - mean[j];
        // 연령대끼리의 내적 행렬(g×g) 고유벡터로 문항 공간의 주성분 축을 만든다(점이 적어 g×g로 계산한다).
        double[][] gram = new double[g][g];
        double total = 0;
        for (int a = 0; a < g; a++) for (int b = 0; b < g; b++) gram[a][b] = dot(centered[a + 1], centered[b + 1]);
        for (int a = 0; a < g; a++) total += gram[a][a];
        double[][] axes = new double[2][k];
        double captured = 0;
        for (int c = 0; c < 2; c++) {
            double[] v = new double[g];
            for (int i = 0; i < g; i++) v[i] = 1.0 + i;  // 고정 시작값: 같은 입력이면 같은 좌표
            double lambda = 0;
            for (int iter = 0; iter < 500; iter++) {
                double[] next = new double[g];
                for (int a = 0; a < g; a++) for (int b = 0; b < g; b++) next[a] += gram[a][b] * v[b];
                double norm = Math.sqrt(dot(next, next));
                if (norm < 1e-12) break;
                for (int i = 0; i < g; i++) next[i] /= norm;
                lambda = norm;
                v = next;
            }
            captured += lambda;
            if (lambda > 1e-12) for (int i = 0; i < g; i++) for (int j = 0; j < k; j++) axes[c][j] += v[i] * centered[i + 1][j] / Math.sqrt(lambda);
            for (int a = 0; a < g; a++) for (int b = 0; b < g; b++) gram[a][b] -= lambda * v[a] * v[b];  // 다음 성분을 위해 제거
        }
        double[][] coords = new double[n][2];
        for (int i = 0; i < n; i++) for (int c = 0; c < 2; c++) coords[i][c] = dot(centered[i], axes[c]);
        if (coords[n - 1][0] < 0) for (double[] p : coords) p[0] = -p[0];
        if (coords[1][1] < 0) for (double[] p : coords) p[1] = -p[1];
        double scale = 0;
        for (double[] p : coords) scale = Math.max(scale, Math.max(Math.abs(p[0]), Math.abs(p[1])));
        List<Point> points = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            double x = scale == 0 ? 0 : coords[i][0] / scale, y = scale == 0 ? 0 : coords[i][1] / scale;
            points.add(new Point(ids.get(i), labels.get(i), Math.round(x * 1000) / 1000.0, Math.round(y * 1000) / 1000.0, i == 0));
        }
        return new Layout(points, total == 0 ? 1 : Math.round(captured / total * 100) / 100.0);
    }

    private static double dot(double[] a, double[] b) {
        double s = 0;
        for (int i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
    }
}
