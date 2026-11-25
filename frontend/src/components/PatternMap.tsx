import { useState } from 'react';
import type { Age, AgeMap } from '../api/insights';
import { ageColor } from '../ageColors';
import { formatNumber } from '../api/numbers';
import { withJosa } from './Common';

/** 고른 연령대 기준 문장. 아래 막대(가까운 순서)와 같은 내용을 말한다. */
export function ageMapSentence(map: AgeMap, ages: Age[], age: string): string | null {
  if (!map.distance_matrix || !map.age_order.includes(age)) return null;
  const name = (id: string) => ages.find(item => item.id === id)?.label ?? id;
  const row = map.distance_matrix[map.age_order.indexOf(age)];
  const ranks = map.age_order.flatMap((other, i) => other === age ? [] : [{ other, distance: row[i] }])
    .sort((a, b) => a.distance - b.distance);
  if (ranks.length < 2) return null;
  const near = map.nearest.find(item => item.age_group === age);
  const closest = near?.closest_age ?? ranks[0].other;
  const farthest = ranks[ranks.length - 1].other;
  const tie = near?.near_tie && near.second_age && near.second_age !== farthest ? ` ${name(near.second_age)}도 근소한 차이로 가까워요.` : '';
  return `${withJosa(name(age), '와', '과')} 가장 가까운 연령대는 ${name(closest)}, 가장 먼 연령대는 ${withJosa(name(farthest), '예요', '이에요')}.${tie}`;
}

export default function PatternMap({ map, ages, matches = [], compact = false, focusAge, overall, explanation }: {
  map: AgeMap; ages: Age[]; matches?: string[]; compact?: boolean; focusAge?: string;
  /** 리포트에서: 전체 데이터 기준 문장(이웃 연령대 중 차이가 가장 큰 쌍)과 막대 설명 */
  overall?: string; explanation?: string;
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
    {!compact && <p className="insight-headline" aria-live="polite">{ageMapSentence(map, ages, selected)}</p>}
    {!compact && explanation && <p className="insight-caption">{explanation}</p>}
    {!compact && <label>기준 연령대<select value={selected} onChange={event => setChosen(event.target.value)}>
      {map.age_order.map(age => <option key={age} value={age}>{name(age)}</option>)}
    </select></label>}
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
    {!compact && overall && <p className="insight-caption">전체 연령대를 순서대로 놓고 보면, {overall}</p>}
  </div>;
}
