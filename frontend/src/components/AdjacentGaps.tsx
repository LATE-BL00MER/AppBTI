import type { Age, AgeMap } from '../api/insights';

// '이웃한 연령대 중 ○○와 ○○의 차이가 가장 커요' 헤드라인과 같은 기준(이웃한 두 연령대 사이 거리)으로 그린다.
export default function AdjacentGaps({ map, ages }: { map: AgeMap; ages: Age[] }) {
  const pairs = map.adjacent ?? [];
  if (!pairs.length) return null;
  const name = (id: string) => ages.find(age => age.id === id)?.label ?? id;
  const max = Math.max(0, ...pairs.map(pair => pair.distance));
  const largest = map.largest_adjacent_gap;
  const isLargest = (left: string, right: string) => largest?.left === left && largest?.right === right;
  return <div className="insight-map">
    <p className="insight-caption">이웃한 두 연령대 사이 · 막대가 길수록 이용 패턴 차이가 커요.</p>
    <div className="insight-distance-list" aria-label="이웃한 연령대 사이 이용 패턴 차이. 막대가 길수록 차이가 커요.">
      {pairs.map(({ left, right, distance }) => <div className="insight-distance-row" key={`${left}-${right}`}>
        <span>{name(left)}–{name(right)}</span>
        <span className="insight-distance-track" aria-hidden="true">
          <span className={isLargest(left, right) ? 'is-largest' : undefined} style={{ width: max ? `${100 * distance / max}%` : '0%' }} />
        </span>
        <span>{isLargest(left, right) ? '가장 큼' : ''}</span>
      </div>)}
    </div>
  </div>;
}
