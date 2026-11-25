import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber, ratioScale } from '../api/numbers';

export default function MonthlyAgeChart({ points, ages, selected }: {
  points: { month: string; values: Record<string, number> }[];
  ages: { id: string; label: string }[];
  selected: string;
}) {
  const data = points.map(point => ({ ...point.values, label: formatNumber(Number(point.month.slice(5)), '월') }));
  const { ticks } = ratioScale(points.flatMap(point => Object.values(point.values)));
  return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 15, right: 18, bottom: 3, left: 4 }}>
      <CartesianGrid vertical={false} stroke="#e3ebe5" />
      <XAxis dataKey="label" axisLine={false} tickLine={false} />
      <YAxis width={55} domain={[ticks[0], ticks.at(-1)!]} ticks={ticks} scale="log" allowDataOverflow
        axisLine={false} tickLine={false} tickFormatter={value => formatNumber(value, '배')} />
      <ReferenceLine y={1} ifOverflow="extendDomain" stroke="#65756d" strokeDasharray="4 4" />
      <Tooltip formatter={(value, name) => [formatNumber(typeof value === 'number' ? value : null, '배'), name]} />
      {[...ages.filter(age => age.id !== selected), ...ages.filter(age => age.id === selected)].map(age =>
        <Line key={age.id} dataKey={age.id} name={age.label} stroke={age.id === selected ? '#006c48' : '#adb9b3'}
          strokeWidth={age.id === selected ? 3 : 1.5} type="linear" isAnimationActive={false}
          dot={age.id === selected ? { r: 3 } : false} />
      )}
    </LineChart>
  </ResponsiveContainer>;
}
