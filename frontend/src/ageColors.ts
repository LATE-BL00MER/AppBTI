// API에 정의된 집단 순서에 따라 초록에서 보라로 바뀐다.
const ageColors = ['#9cddb0', '#67cdb3', '#72bad3', '#3d619d', '#6550a1', '#613482'];

export function ageColor(index: number): string {
  return ageColors[Math.min(Math.max(index, 0), ageColors.length - 1)];
}

export function isLightAgeColor(index: number): boolean {
  return index < 3;
}
