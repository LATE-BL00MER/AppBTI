// API에 정의된 집단 순서에 따라 명도가 낮아진다.
const ageColors = ['#b6eacb', '#84d4a3', '#51b980', '#389968', '#16633f', '#103c29'];

export function ageColor(index: number): string {
  return ageColors[Math.min(Math.max(index, 0), ageColors.length - 1)];
}

export function isLightAgeColor(index: number): boolean {
  return index < 4;
}
