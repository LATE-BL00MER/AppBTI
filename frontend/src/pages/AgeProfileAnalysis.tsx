import { Link } from 'react-router-dom';
import type { Meta } from '../api/types';
import { withJosa } from '../components/Common';
import { TableViewport } from '../components/InsightTable';
import { formatNumber } from '../api/numbers';

type PatternMetric = 'avgDays' | 'avgDailyTime';
export type GroupProfiles = {
  featureCounts: Partial<Record<PatternMetric, number>>;
  nearTiePercent: number;
  groups: Record<string, {
    closestAges: string[];
    distances: { age: string; distance: number }[];
    runnerUpAge: string | null;
    nearTie: boolean;
    comparisonAge: string;
    differences: { minorCode: string; metric: PatternMetric; emphasizedAge: string }[];
    heldOut: { month: string; nearest: string[] | null }[];
    testedMonths: number;
    sameGroupMonths: number;
  }>;
};
const metricName = { avgDays: '이용일수', avgDailyTime: '이용시간' } as const;

export default function AgeProfileAnalysis({ profiles, age, meta }: {
  profiles: GroupProfiles; age: Meta['ageGroups'][number]; meta: Meta;
}) {
  const group = profiles.groups[age.id];
  if (!group) return null;
  const ageName = (id: string) => meta.ageGroups.find(candidate => candidate.id === id)?.label ?? id;
  const comparableAges = [...group.closestAges];
  if (group.nearTie && group.runnerUpAge && !comparableAges.includes(group.runnerUpAge)) {
    comparableAges.push(group.runnerUpAge);
  }
  const nearestNames = comparableAges.map(ageName).join(' · ');
  const compared = Object.entries(profiles.featureCounts).map(([metric, count]) => (
    `${metricName[metric as PatternMetric]} ${count}개`
  )).join(' · ');
  const maxDistance = Math.max(0, ...group.distances.map(item => item.distance));

  return <section className="patterns-profile" aria-labelledby="patterns-profile-title">
    <h2 id="patterns-profile-title">전체 이용 패턴이 비슷한 연령대</h2>
    <div className="patterns-profile-summary">
      <div>
        <p>{withJosa(age.label, '와', '과')} 이용 패턴이 가까운 연령대</p>
        <strong>{nearestNames}</strong>
        {group.nearTie && <span>1·2위 근소 · 거리 차이가 차순위 거리의 {formatNumber(profiles.nearTiePercent, '%')} 미만이에요.</span>}
      </div>
      <div>
        <p>{age.label}의 월별 패턴을 따로 비교한 결과</p>
        <strong>{group.testedMonths > 0 ? `${group.testedMonths}개월 중 ${group.sameGroupMonths}개월` : '비교할 값 부족'}</strong>
        {group.testedMonths > 0 && <span>나머지 달로 만든 기준에서도 같은 연령대에 가장 가까웠어요.</span>}
      </div>
    </div>
    {!!group.distances.length && <div className="patterns-distances">
      <p>막대가 짧을수록 {withJosa(age.label, '와', '과')} 이용 패턴이 비슷해요.</p>
      {group.distances.map((item, index) => {
        const closest = group.closestAges.includes(item.age);
        const closeRunnerUp = group.nearTie && item.age === group.runnerUpAge && !closest;
        return <div className="patterns-distance" key={item.age}>
          <span>{formatNumber(index + 1, '위')} · {ageName(item.age)}</span>
          <span className="patterns-distance-track" aria-hidden="true">
            <i className={closest || closeRunnerUp ? 'current' : undefined}
              style={{ width: maxDistance > 0 ? `${100 * item.distance / maxDistance}%` : '0%' }} />
          </span>
          <strong>{closest ? '가장 가까움' : closeRunnerUp ? '근소' : index === group.distances.length - 1 ? '가장 멂' : ''}</strong>
        </div>;
      })}
    </div>}
    {group.differences.length > 0 && <details className="patterns-method">
      <summary>가까운 두 연령대는 어떤 서비스에서 달랐나요?</summary>
      <p>{withJosa(age.label, '와', '과')} {ageName(group.comparisonAge)}를 비교했어요. 아래 서비스는 각 연령대의 전체 이용 습관 안에서 상대적으로 차이가 컸어요.</p>
      <ul className="patterns-profile-examples">
        {group.differences.map(item => {
          const name = meta.minorCategories.find(category => category.code === item.minorCode)?.name ?? item.minorCode;
          const params = new URLSearchParams({ minor: item.minorCode, metric: item.metric });
          return <li key={`${item.metric}:${item.minorCode}`}>
            <Link to={`/explore?${params}#monthly-trend`} className="text-link">{name}</Link>
            <span>{metricName[item.metric]}에서 {withJosa(ageName(item.emphasizedAge), '가', '이')} 상대적으로 높았어요.</span>
          </li>;
        })}
      </ul>
    </details>}
    <details className="patterns-method">
      <summary>어떻게 계산했나요?</summary>
      <p>같은 기준으로 제공된 카테고리({compared})를 사용했어요. 각 달·연령대에서 값을 지표별로 로그 중심화(CLR)해 어떤 서비스를 상대적으로 더 이용하는지 비교했어요. {Object.keys(profiles.featureCounts).length > 1 ? '두 지표에 같은 비중을 주고 거리로 가까운 연령대를 찾았어요.' : '패턴의 거리로 가까운 연령대를 찾았어요.'}</p>
      <p>월별 검증에서는 한 달씩 빼고, 나머지 달로 비교 항목과 연령대 기준을 만들었어요. 아래는 빼 둔 각 달의 {age.label} 집계를 비교한 결과예요.</p>
      <TableViewport label="월별 비교 결과"><table className="stat-table">
        <thead><tr><th scope="col">평가월</th><th scope="col">가장 가까운 연령대</th></tr></thead>
        <tbody>{group.heldOut.map(row => <tr key={row.month}>
          <th scope="row">{Number(row.month.slice(5))}월</th>
          <td>{row.nearest?.map(ageName).join(' · ') ?? '비교할 값 부족'}</td>
        </tr>)}</tbody>
      </table></TableViewport>
    </details>
  </section>;
}
