import { formatNumber } from '../api/numbers';
import { standoutAge, type InsightsDocument } from '../api/insights';
import RatioBars from './RatioBars';
import { keepTogether, withJosa } from './Common';

type Pick = NonNullable<ReturnType<typeof standoutAge>>;

/** '연령대별로 두드러지는 서비스' 한 문장. 홈과 리포트가 같은 문장을 쓴다. */
export function standoutSentence(pick: Pick) {
  // '약 ○배'가 실제 이용량 배수로 읽히지 않도록 '평균 대비 두드러짐'으로 쓴다(AGENTS.md 10장 문구 규칙).
  return `${keepTogether(pick.age.label)}에서 가장 두드러진 서비스는 ${withJosa(pick.rows[0].minor_name, '예요', '이에요')}(여섯 연령대 평균 대비 약\u00A0${formatNumber(pick.rows[0].multiplier, '배')}).`;
}

/**
 * 고른 연령대에서 유독 두드러지는 서비스 상위 3개와,
 * 반대로 여섯 연령대가 비슷하게 쓰는 서비스(연령대 간 편차가 작은 공통 사례)를 함께 보여 준다.
 */
// compact: 홈 카드처럼 설명 문장과 공통 서비스 목록을 바깥(또는 리포트)에 맡기고 막대만 그린다.
export default function AgeStandout({ document, pick, compact = false }: { document: InsightsDocument; pick: Pick; compact?: boolean }) {
  const common = document.insights.common_signature.chart_data.common;
  return <>
    {!compact && <p className="insight-caption">{pick.age.label}에서 유독 두드러지는 서비스 상위 3개 · 가운데 1배는 여섯 연령대 평균이에요.</p>}
    <RatioBars label={`${pick.age.label} 상대적 두드러짐 상위 3개`} rows={pick.rows.slice(0, 3).map(point =>
      ({ id: point.minor_code, label: point.minor_name, value: point.multiplier, highlight: true }))} />
    {!compact && common.length > 0 && <p className="insight-common">
      <span>반대로 여섯 연령대가 비슷하게 쓰는 서비스</span>
      {common.map(item => item.minor_name).join(' · ')}
    </p>}
  </>;
}
