// API에 정의된 집단 순서에 따라 명도가 낮아진다.
const ageColors = ['#326d4d', '#2c6446', '#265b3f', '#205238', '#194831', '#153d29'];

export function ageColor(index: number): string {
  return ageColors[Math.min(Math.max(index, 0), ageColors.length - 1)];
}
