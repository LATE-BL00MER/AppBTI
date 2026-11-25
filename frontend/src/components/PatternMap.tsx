import { useState } from 'react';
import type { Age, AgeMap } from '../api/insights';
import { ageColor } from '../ageColors';
import { formatNumber } from '../api/numbers';
import { withJosa } from './Common';

export default function PatternMap({ map, ages, matches = [], compact = false, focusAge }: {
  map: AgeMap; ages: Age[]; matches?: string[]; compact?: boolean; focusAge?: string;
}) {
  const nearestMatch = matches.find(age => map.age_order.includes(age));
  const [chosen, setChosen] = useState('');
  if (!map.distance_matrix) return <p>연령대 거리를 비교할 데이터가 충분하지 않아요.</p>;
  const selected = map.age_order.includes(chosen) ? chosen : nearestMatch ?? focusAge ?? map.age_order[0];
  const index = map.age_order.indexOf(selected);
  const name = (id: string) => ages.find(age => age.id === id)?.label ?? id;
  const near = map.nearest.find(item => item.age_group === selected);
  const distances = map.distance_matrix[index];
  const ranks = map.age_order.flatMap((age, i) => age === selected ? [] : [{ age, distance: distances[i] }])
    .sort((a, b) => a.distance - b.distance);
  const max = Math.max(0, ...ranks.map(row => row.distance));
  const focus = ageColor(ages.findIndex(age => age.id === selected));
  const note = (age: string, rank: number) => rank === 0 ? '가장 가까움' : near?.near_tie && age === near.second_age
    ? '근소' : rank === ranks.length - 1 ? '가장 멂' : '';

  return <div className="insight-map">
    {compact && <p className="insight-caption">{name(selected)} 기준 · 막대가 짧을수록 가까워요.</p>}
    {!compact && <label>기준 연령대<select value={selected} onChange={event => setChosen(event.target.value)}>
      {map.age_order.map(age => <option key={age} value={age}>{name(age)}</option>)}
    </select></label>}
    {!compact && near && <p className="insight-caption">{withJosa(name(selected), '와', '과')} 가장 가까운 패턴은 {name(near.closest_age)}에서 보여요.
      {near.near_tie && <> {withJosa(name(near.second_age), '와', '과')}의 차이도 근소해요.</>}</p>}
    <div className="insight-distance-list" aria-label={`${name(selected)} 기준 이용 패턴 차이. 막대가 짧을수록 가까워요.`}>
      {ranks.map(({age, distance}, i) => <div className="insight-distance-row" key={age}>
        <span>{formatNumber(i + 1, '위')} · {name(age)}</span>
        <span className="insight-distance-track" aria-hidden="true">
          <span style={{ width: max ? `${100 * distance / max}%` : '0%', background: i === 0 ? focus : undefined }} />
        </span>
        <span>{note(age, i)}</span>
      </div>)}
    </div>
    {nearestMatch && <p className="insight-caption">내 응답과 가장 가까운 연령대 · {matches.map(name).join(' · ')}</p>}
  </div>;
}
