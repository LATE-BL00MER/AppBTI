import { formatNumber } from '../api/numbers';
import { standoutAge, type InsightsDocument } from '../api/insights';
import RatioBars from './RatioBars';
import { withJosa } from './Common';

type Pick = NonNullable<ReturnType<typeof standoutAge>>;

/** '연령대별로 두드러지는 서비스' 한 문장. 홈과 리포트가 같은 문장을 쓴다. */
export function standoutSentence(pick: Pick) {
  return `${pick.age.label}에서 가장 두드러진 서비스는 ${pick.rows[0].minor_name}, 여섯 연령대 평균의 약 ${formatNumber(pick.rows[0].multiplier, '배')}예요.`;
}

/**
 * 고른 연령대가 유독 많이 쓰는 서비스 상위 3개와,
 * 반대로 여섯 연령대가 비슷하게 쓰는 서비스(연령대 간 편차가 작은 공통 사례)를 함께 보여 준다.
 */
export default function AgeStandout({ document, pick }: { document: InsightsDocument; pick: Pick }) {
  const common = document.insights.common_signature.chart_data.common;
  return <>
    <p className="insight-caption">{withJosa(pick.age.label, '가', '이')} 유독 많이 쓰는 서비스 상위 3개 · 가운데 1배는 여섯 연령대 평균이에요.</p>
    <RatioBars label={`${pick.age.label} 상대적 두드러짐 상위 3개`} rows={pick.rows.slice(0, 3).map(point =>
      ({ id: point.minor_code, label: point.minor_name, value: point.multiplier, highlight: true }))} />
    {common.length > 0 && <p className="insight-common">
      <span>반대로 여섯 연령대가 비슷하게 쓰는 서비스</span>
      {common.map(item => item.minor_name).join(' · ')}
    </p>}
  </>;
}
