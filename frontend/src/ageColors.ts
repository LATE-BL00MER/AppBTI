// 초록과 보라 사이를 같은 간격으로 보간한 여섯 색을 집단 순서에 적용한다.
const ageColors = ['#8cd09e', '#83ae96', '#7a8c8f', '#706a87', '#674880', '#5e2678'];

export function ageColor(index: number): string {
  return ageColors[Math.min(Math.max(index, 0), ageColors.length - 1)];
}

export function isLightAgeColor(index: number): boolean {
  return index < 3;
}
